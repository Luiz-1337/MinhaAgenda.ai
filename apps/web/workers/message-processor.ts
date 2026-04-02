/**
 * Async worker for WhatsApp message processing.
 */

import { Worker, Job, DelayedError } from "bullmq";
import { createRedisClientForBullMQ, acquireLock, releaseLock, getRedisClient } from "../lib/infra/redis";
import { MessageJobData, MessageJobResult } from "../lib/queues/message-queue";
import { logger, createContextLogger, getReplicaId } from "../lib/infra/logger";
import { generateAIResponse } from "../lib/services/ai/generate-response.service";
import { saveMessage } from "../lib/services/chat.service";
import {
  sendWhatsAppMessage,
  isSessionError,
  getSessionErrorReason,
  WhatsAppMessageError,
} from "../lib/services/evolution/evolution-message.service";
import { restartInstance } from "../lib/services/evolution/evolution-instance.service";
import { db, chats, salons as salonsTable, domainServices, eq } from "@repo/db";
import { WhatsAppError, getUserFriendlyMessage } from "../lib/errors";
import { withTimeout } from "../lib/utils/async.utils";
import { WhatsAppMetrics } from "../lib/infra/metrics";

const QUEUE_NAME = "whatsapp-messages";
const LOCK_TTL_MS = 120000;
const AI_TIMEOUT_MS = 90000;
const CONCURRENCY = 10;
const SESSION_RECOVERY_LOCK_TTL_MS = 10 * 60 * 1000;

async function triggerSessionRecovery(
  instanceName: string,
  jobLogger: ReturnType<typeof createContextLogger>
): Promise<void> {
  const recoveryResource = `session:recover:${instanceName}`;
  const recoveryLockId = await acquireLock(recoveryResource, SESSION_RECOVERY_LOCK_TTL_MS);

  if (!recoveryLockId) {
    jobLogger.warn(
      { instanceName, recoveryResource },
      "Session recovery already in progress or in cooldown"
    );
    return;
  }

  try {
    await restartInstance(instanceName);
    jobLogger.warn(
      { instanceName, recoveryResource },
      "Session recovery triggered by restarting Evolution instance"
    );
  } catch (error) {
    jobLogger.error(
      { err: error, instanceName, recoveryResource },
      "Failed to trigger session recovery"
    );
  }
  // Keep lock until TTL expires to avoid recovery loops.
}

/**
 * Envia uma mensagem de aviso ao cliente quando a assinatura do salão está inativa.
 * Usa um TTL no Redis para evitar spam: envia no máximo uma vez a cada 24h por chat.
 */
async function notifyClientSubscriptionBlocked(
  sendTo: string,
  salonId: string,
  agentId: string,
  reason: 'canceled' | 'past_due',
  jobLogger: ReturnType<typeof createContextLogger>
): Promise<void> {
  try {
    const redis = getRedisClient();
    const cooldownKey = `subscription:blocked:${salonId}:${sendTo}`;
    const alreadyNotified = await redis.set(cooldownKey, '1', 'EX', 60 * 60 * 24, 'NX');
    if (alreadyNotified === null) return; // Já notificado nas últimas 24h

    const message = reason === 'canceled'
      ? 'Olá! No momento nosso atendimento automatizado está temporariamente indisponível. Entre em contato diretamente conosco para agendar. Desculpe o transtorno!'
      : 'Olá! Estamos com uma pendência no pagamento e o atendimento automatizado está pausado. Entre em contato conosco diretamente. Obrigado pela compreensão!';

    await sendWhatsAppMessage(sendTo, message, salonId, { agentId });
  } catch (err) {
    jobLogger.warn({ err }, "Failed to send subscription blocked notification to client");
  }
}

async function processMessage(
  job: Job<MessageJobData, MessageJobResult>
): Promise<MessageJobResult> {
  const {
    messageId,
    chatId,
    salonId,
    agentId,
    customerId,
    clientPhone,
    replyToJid,
    body,
    hasMedia,
    mediaType,
    customerName,
    isNewCustomer,
  } = job.data;

  const instanceName = job.data.instanceName || "unknown";
  const remoteJid = job.data.remoteJid || clientPhone;
  const remoteJidAlt = job.data.remoteJidAlt;
  const addressingMode =
    job.data.addressingMode || (remoteJid.endsWith("@lid") ? "lid" : "jid");

  const sendTo = replyToJid || remoteJid || clientPhone;

  const jobLogger = createContextLogger({
    jobId: job.id,
    messageId,
    chatId,
    salonId,
    instanceName,
    remoteJid,
    remoteJidAlt,
    addressingMode,
    replica: getReplicaId(),
    attempt: job.attemptsMade + 1,
  });

  const startTime = Date.now();
  let lockId: string | null = null;

  try {
    jobLogger.info("Processing message job");

    // Rate limiting é feito no webhook (antes de enfileirar).
    // Não verificar aqui novamente — causaria double-count no Redis e
    // dispararia avisos desnecessários ao cliente.

    lockId = await acquireLock(`chat:${chatId}`, LOCK_TTL_MS);
    if (!lockId) {
      // Outra instância está processando este chat. Reagendar o job para 60s depois
      // usando moveToDelayed + DelayedError — não conta como tentativa falha.
      // Após 60s o lock já foi liberado e o job reprocessa normalmente.
      // O check de coalescing decidirá se deve gerar resposta ou pular.
      const retryDelay = 60_000;
      jobLogger.info(
        { chatId, lockTtlMs: LOCK_TTL_MS, retryIn: retryDelay },
        "Chat lock unavailable — rescheduling job for later."
      );
      await job.moveToDelayed(Date.now() + retryDelay, job.token!);
      throw new DelayedError();
    }

    // Coalescing: verifica se uma mensagem mais recente chegou para o mesmo chat.
    // Se sim, este job é descartado silenciosamente — o job mais recente irá
    // processar toda a conversa (incluindo esta mensagem, que já está no DB).
    const redis = getRedisClient();
    const latestMessageId = await redis.get(`chat:latest-job:${chatId}`);
    if (latestMessageId && latestMessageId !== messageId) {
      jobLogger.info(
        { latestMessageId },
        "Message coalesced — newer message will handle the response"
      );
      return {
        status: "coalesced",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    const chatRecord = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { isManual: true },
    });

    if (chatRecord?.isManual) {
      jobLogger.info("Chat in manual mode, skipping AI processing");
      return {
        status: "manual_mode",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    // Check subscription status before processing
    const salonRecord = await db.query.salons.findFirst({
      where: eq(salonsTable.id, salonId),
      columns: { subscriptionStatus: true, subscriptionStatusChangedAt: true },
    });

    if (!salonRecord || salonRecord.subscriptionStatus === 'CANCELED') {
      jobLogger.info({ salonId, status: salonRecord?.subscriptionStatus }, "Salon subscription inactive, skipping AI processing");
      await notifyClientSubscriptionBlocked(sendTo, salonId, agentId, 'canceled', jobLogger);
      return {
        status: "manual_mode",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    // PAST_DUE: 3 days grace period from when status changed
    if (salonRecord.subscriptionStatus === 'PAST_DUE') {
      const gracePeriodMs = 3 * 24 * 60 * 60 * 1000; // 3 days
      const changedAt = salonRecord.subscriptionStatusChangedAt ? new Date(salonRecord.subscriptionStatusChangedAt).getTime() : 0;
      if (Date.now() - changedAt > gracePeriodMs) {
        jobLogger.info({ salonId }, "Salon PAST_DUE grace period expired, skipping AI processing");
        await notifyClientSubscriptionBlocked(sendTo, salonId, agentId, 'past_due', jobLogger);
        return {
          status: "manual_mode",
          chatId,
          messageId,
          duration: Date.now() - startTime,
        };
      }
    }

    const { getSalonRemainingCredits } = await import("../lib/services/credits.service");
    const creditsResult = await getSalonRemainingCredits(salonId);

    if ('error' in creditsResult) {
      jobLogger.error({ salonId, error: creditsResult.error }, "Failed to fetch remaining credits, will retry");
      throw new Error(`Credits check failed: ${creditsResult.error}`);
    }

    if (creditsResult.remaining <= 0) {
      jobLogger.info({ salonId, total: creditsResult.total, used: creditsResult.used }, "Salon out of credits, skipping AI processing");
      return {
        status: "out_of_credits",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    if (hasMedia) {
      const permanentMediaUrl = job.data.mediaUrl;

      if (permanentMediaUrl) {
        jobLogger.info(
          {
            mediaType,
            hasMediaUrl: !!permanentMediaUrl,
          },
          "Media URL available from Evolution API"
        );
      }

      const mediaResponse = await handleMediaMessage(mediaType, permanentMediaUrl);

      await sendWhatsAppMessage(sendTo, mediaResponse, salonId, { agentId });
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

    const response = await withTimeout(
      generateAIResponse({
        chatId,
        salonId,
        clientPhone,
        userMessage: body,
        customerId,
        customerName,
        isNewCustomer,
      }),
      AI_TIMEOUT_MS,
      "generateAIResponse"
    );

    await sendWhatsAppMessage(sendTo, response.text, salonId, { agentId });

    const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);

    await saveMessage(chatId, "assistant", response.text, {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      model: response.model,
      requiresResponse,
    });

    // Debita os tokens usados do saldo mensal do salão
    if (response.usage.totalTokens > 0) {
      const { debitSalonCredits } = await import("../lib/services/credits.service");
      await debitSalonCredits(salonId, response.usage.totalTokens, response.model ?? "unknown");
    }

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
    const hasSessionFailure = isSessionError(error);
    const sessionReason = getSessionErrorReason(error);
    const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
    const currentAttempt = job.attemptsMade + 1;

    jobLogger.error(
      {
        err: error,
        duration,
        retryable: isRetryable,
        hasSessionFailure,
        sessionReason,
        currentAttempt,
        maxAttempts,
      },
      "Error processing message"
    );

    if (hasSessionFailure) {
      WhatsAppMetrics.decryptFail({
        reason: sessionReason || "session_error",
        addressingMode,
        instanceName,
      });

      if (instanceName !== "unknown") {
        await triggerSessionRecovery(instanceName, jobLogger);
      } else {
        jobLogger.warn("Skipping session recovery: missing instanceName in job payload");
      }

      if (currentAttempt >= maxAttempts) {
        const exhaustedMessage =
          "Estou com uma instabilidade temporaria no WhatsApp. Tente novamente em alguns instantes.";

        try {
          await sendWhatsAppMessage(sendTo, exhaustedMessage, salonId, { agentId });
          await saveMessage(chatId, "assistant", exhaustedMessage);
        } catch (sendError) {
          jobLogger.error(
            { err: sendError },
            "Failed to send session-recovery exhausted message to client"
          );
        }

        return {
          status: "error",
          chatId,
          messageId,
          duration,
          error: error instanceof Error ? error.message : "Session recovery exhausted",
        };
      }
    }

    if (error instanceof WhatsAppError && !error.retryable) {
      try {
        const errorMessage = getUserFriendlyMessage(error);
        await sendWhatsAppMessage(sendTo, errorMessage, salonId, { agentId });
        await saveMessage(chatId, "assistant", errorMessage);
      } catch (sendError) {
        jobLogger.error({ err: sendError }, "Failed to send error message to client");
      }

      return {
        status: "error",
        chatId,
        messageId,
        duration,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // WhatsAppMessageError (evolution-message.service.ts) não estende WhatsAppError —
    // precisa de guard separado para evitar que erros non-retryable fiquem em loop.
    if (error instanceof WhatsAppMessageError) {
      if (!error.retryable) {
        const errorMessage = "Desculpe, não consegui enviar sua resposta. Tente novamente em instantes.";
        try {
          await sendWhatsAppMessage(sendTo, errorMessage, salonId, { agentId });
          await saveMessage(chatId, "assistant", errorMessage);
        } catch (sendError) {
          jobLogger.error({ err: sendError }, "Failed to send WhatsAppMessageError fallback to client");
        }
        return {
          status: "error",
          chatId,
          messageId,
          duration,
          error: error.message,
        };
      }
      throw error; // retryable — BullMQ retentar com backoff
    }

    throw error;
  } finally {
    if (lockId) {
      try {
        await releaseLock(`chat:${chatId}`, lockId);
      } catch (releaseError) {
        jobLogger.error({ err: releaseError }, "Failed to release lock");
      }
    }
  }
}

async function handleMediaMessage(
  mediaType?: "image" | "audio" | "video" | "document",
  permanentUrl?: string
): Promise<string> {
  const mediaLabels: Record<string, string> = {
    image: "imagem",
    audio: "audio",
    video: "video",
    document: "documento",
  };

  const label = mediaType ? mediaLabels[mediaType] || "midia" : "midia";

  if (permanentUrl) {
    logger.debug({ mediaType, hasUrl: true }, "Media stored for future processing");
  }

  return `Ola! No momento, aceitamos apenas mensagens de texto. Recebi sua ${label}, mas nao consigo processa-la. Por favor, envie sua mensagem digitada. Obrigado!`;
}

export function createMessageWorker(): Worker<MessageJobData, MessageJobResult> {
  const connection = createRedisClientForBullMQ();

  const worker = new Worker<MessageJobData, MessageJobResult>(
    QUEUE_NAME,
    processMessage,
    {
      connection,
      concurrency: CONCURRENCY,
      lockDuration: LOCK_TTL_MS,
      limiter: {
        max: 100,
        duration: 60000,
      },
    }
  );

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

  logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, "Message worker started");

  return worker;
}

if (require.main === module) {
  logger.info("Starting message processor worker...");

  const worker = createMessageWorker();

  const shutdown = async () => {
    logger.info("Shutting down worker...");
    await worker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { processMessage };
