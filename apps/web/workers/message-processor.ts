/**
 * Worker assíncrono para processamento de mensagens WhatsApp
 * 
 * Features:
 * - Processamento de fila BullMQ
 * - Rate limiting por telefone
 * - Lock distribuído por chat (processamento sequencial)
 * - Retry automático com backoff exponencial
 * - Tratamento de modo manual
 * - Mídia handling com storage permanente
 */

import { Worker, Job } from "bullmq";
import { getRedisClient, createRedisClientForBullMQ, acquireLock, releaseLock } from "../lib/redis";
import {
  MessageJobData,
  MessageJobResult,
} from "../lib/queues/message-queue";
import { logger, createContextLogger, hashPhone } from "../lib/logger";
import { checkPhoneRateLimit } from "../lib/rate-limit";
import { generateAIResponse, checkIfNewCustomer } from "../lib/services/ai/generate-response.service";
import { saveMessage, findOrCreateCustomer, getChatHistory } from "../lib/services/chat.service";
import { sendWhatsAppMessage } from "../lib/services/whatsapp.service";
import {
  downloadAndStoreTwilioMedia,
  isTwilioMediaUrl,
} from "../lib/services/media-storage.service";
import { db, chats, domainServices } from "@repo/db";
import { eq } from "drizzle-orm";
import {
  WhatsAppError,
  RateLimitError,
  LockTimeoutError,
  AIGenerationError,
  getUserFriendlyMessage,
} from "../lib/errors";

// Configuração do worker
const QUEUE_NAME = "whatsapp-messages";
const LOCK_TTL_MS = 60000; // 60 segundos
const CONCURRENCY = 10; // Jobs simultâneos

/**
 * Processa um job de mensagem
 */
async function processMessage(
  job: Job<MessageJobData, MessageJobResult>
): Promise<MessageJobResult> {
  const {
    messageId,
    chatId,
    salonId,
    customerId,
    clientPhone,
    body,
    hasMedia,
    mediaType,
    customerName,
    isNewCustomer,
  } = job.data;

  const jobLogger = createContextLogger({
    jobId: job.id,
    messageId,
    chatId,
    salonId,
    attempt: job.attemptsMade + 1,
  });

  const startTime = Date.now();
  let lockId: string | null = null;

  try {
    jobLogger.info("Processing message job");

    // 1. Rate Limiting
    try {
      await checkPhoneRateLimit(clientPhone);
    } catch (error) {
      if (error instanceof RateLimitError) {
        jobLogger.warn(
          { resetIn: error.resetIn },
          "Rate limit exceeded, will retry"
        );
        
        // Responde ao cliente sobre rate limit
        await sendWhatsAppMessage(
          clientPhone,
          "Você está enviando muitas mensagens. Por favor, aguarde um momento antes de enviar outra.",
          salonId
        );
        
        return {
          status: "rate_limited",
          chatId,
          messageId,
          duration: Date.now() - startTime,
        };
      }
      throw error;
    }

    // 2. Lock distribuído (garante processamento sequencial por chat)
    lockId = await acquireLock(`chat:${chatId}`, LOCK_TTL_MS);
    if (!lockId) {
      jobLogger.warn("Could not acquire lock, retrying");
      throw new LockTimeoutError(`chat:${chatId}`);
    }

    // 3. Verificar modo manual
    const chatRecord = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { isManual: true },
    });

    if (chatRecord?.isManual) {
      jobLogger.info("Chat in manual mode, skipping AI processing");
      // TODO: Notificar agente humano se necessário
      return {
        status: "manual_mode",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    // 4. Processar mídia
    if (hasMedia) {
      // 4.1 Tenta armazenar mídia permanentemente (URLs do Twilio expiram!)
      let permanentMediaUrl = job.data.mediaUrl;
      
      if (job.data.mediaUrl && isTwilioMediaUrl(job.data.mediaUrl)) {
        const storageResult = await downloadAndStoreTwilioMedia(
          job.data.mediaUrl,
          messageId,
          salonId
        );

        if (storageResult.success && storageResult.permanentUrl) {
          permanentMediaUrl = storageResult.permanentUrl;
          jobLogger.info(
            {
              mediaType,
              originalUrl: "twilio_url_hidden",
              permanentUrl: storageResult.permanentUrl.substring(0, 50) + "...",
              size: storageResult.size,
            },
            "Media stored permanently"
          );
        } else {
          // Log de warning mas continua com URL original (melhor que falhar)
          jobLogger.warn(
            {
              mediaType,
              error: storageResult.error,
            },
            "Failed to store media permanently, using original URL"
          );
        }
      }

      // 4.2 Responde ao cliente (atualmente não processamos mídia)
      const mediaResponse = await handleMediaMessage(mediaType, permanentMediaUrl);
      
      await sendWhatsAppMessage(clientPhone, mediaResponse, salonId);
      await saveMessage(chatId, "assistant", mediaResponse);

      jobLogger.info({ mediaType, hasStoredMedia: !!permanentMediaUrl }, "Media message handled");

      return {
        status: "media_handled",
        chatId,
        messageId,
        responseText: mediaResponse,
        duration: Date.now() - startTime,
      };
    }

    // 5. Gerar resposta com AI
    const response = await generateAIResponse({
      chatId,
      salonId,
      clientPhone,
      userMessage: body,
      customerId,
      customerName,
      isNewCustomer,
    });

    // 6. Enviar via WhatsApp
    await sendWhatsAppMessage(clientPhone, response.text, salonId);

    // 7. Verificar se a resposta requer resposta do cliente
    const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);

    // 8. Salvar resposta no banco
    await saveMessage(chatId, "assistant", response.text, {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      model: response.model,
      requiresResponse,
    });

    const duration = Date.now() - startTime;

    jobLogger.info(
      {
        duration,
        tokensUsed: response.usage.totalTokens,
        responseLength: response.text.length,
      },
      "Message processed successfully"
    );

    return {
      status: "success",
      chatId,
      messageId,
      responseText: response.text,
      tokensUsed: response.usage.totalTokens,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const isRetryable = error instanceof WhatsAppError ? error.retryable : true;

    jobLogger.error(
      {
        err: error,
        duration,
        retryable: isRetryable,
      },
      "Error processing message"
    );

    // Se for erro não-retryable, envia mensagem de erro ao cliente e NÃO faz retry
    if (error instanceof WhatsAppError && !error.retryable) {
      try {
        const errorMessage = getUserFriendlyMessage(error);
        await sendWhatsAppMessage(clientPhone, errorMessage, salonId);
        await saveMessage(chatId, "assistant", errorMessage);
      } catch (sendError) {
        jobLogger.error({ err: sendError }, "Failed to send error message to client");
      }

      // Retorna resultado de erro em vez de throw para evitar retry
      return {
        status: "error" as const,
        chatId,
        messageId,
        duration,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Re-throw apenas para erros retryable
    throw error;
  } finally {
    // Sempre libera o lock
    if (lockId) {
      await releaseLock(`chat:${chatId}`, lockId);
    }
  }
}

/**
 * Trata mensagens de mídia
 * 
 * Atualmente não processamos mídia com AI, mas armazenamos para referência futura.
 * 
 * @param mediaType Tipo de mídia
 * @param permanentUrl URL permanente da mídia armazenada (opcional)
 */
async function handleMediaMessage(
  mediaType?: "image" | "audio" | "video" | "document",
  permanentUrl?: string
): Promise<string> {
  const mediaLabels: Record<string, string> = {
    image: "imagem",
    audio: "áudio",
    video: "vídeo",
    document: "documento",
  };

  const label = mediaType ? mediaLabels[mediaType] || "mídia" : "mídia";

  // TODO: Quando implementar processamento de mídia com AI (ex: GPT-4V para imagens),
  // usar permanentUrl para enviar ao modelo. A mídia já está salva permanentemente.
  
  // Log que mídia foi armazenada (para debug)
  if (permanentUrl) {
    logger.debug({ mediaType, hasUrl: true }, "Media stored for future processing");
  }

  return `Olá! No momento, aceitamos apenas mensagens de texto. Recebi sua ${label}, mas não consigo processá-la. Por favor, envie sua mensagem digitada. Obrigado!`;
}

/**
 * Cria e inicia o worker
 */
export function createMessageWorker(): Worker<MessageJobData, MessageJobResult> {
  // BullMQ requer maxRetriesPerRequest: null
  const connection = createRedisClientForBullMQ();

  const worker = new Worker<MessageJobData, MessageJobResult>(
    QUEUE_NAME,
    processMessage,
    {
      connection,
      concurrency: CONCURRENCY,
      limiter: {
        max: 100, // Máximo 100 jobs
        duration: 60000, // Por minuto
      },
    }
  );

  // Event handlers
  worker.on("completed", (job, result) => {
    logger.info(
      {
        jobId: job.id,
        messageId: job.data.messageId,
        status: result.status,
        duration: result.duration,
      },
      "Job completed"
    );
  });

  worker.on("failed", (job, error) => {
    logger.error(
      {
        jobId: job?.id,
        messageId: job?.data.messageId,
        error: error.message,
        attempts: job?.attemptsMade,
      },
      "Job failed"
    );
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Job stalled");
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "Worker error");
  });

  logger.info(
    { queue: QUEUE_NAME, concurrency: CONCURRENCY },
    "Message worker started"
  );

  return worker;
}

// Execução direta do worker
if (require.main === module) {
  logger.info("Starting message processor worker...");
  
  const worker = createMessageWorker();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { processMessage };
