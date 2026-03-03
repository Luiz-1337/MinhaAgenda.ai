/**
 * Async worker for WhatsApp message processing.
 */

import { Worker, Job } from "bullmq";
import { createRedisClientForBullMQ, acquireLock, releaseLock } from "../lib/redis";
import { MessageJobData, MessageJobResult } from "../lib/queues/message-queue";
import { logger, createContextLogger, getReplicaId } from "../lib/logger";
import { checkPhoneRateLimit } from "../lib/rate-limit";
import { generateAIResponse } from "../lib/services/ai/generate-response.service";
import { saveMessage } from "../lib/services/chat.service";
import {
  sendWhatsAppMessage,
  isSessionError,
  getSessionErrorReason,
} from "../lib/services/evolution-message.service";
import { restartInstance } from "../lib/services/evolution-instance.service";
import { db, chats, domainServices, eq } from "@repo/db";
import { WhatsAppError, RateLimitError, getUserFriendlyMessage } from "../lib/errors";
import { withTimeout } from "../lib/utils/async.utils";
import { WhatsAppMetrics } from "../lib/metrics";

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

async function processMessage(
  job: Job<MessageJobData, MessageJobResult>
): Promise<MessageJobResult> {
  const {
    messageId,
    chatId,
    salonId,
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

    try {
      await checkPhoneRateLimit(clientPhone);
    } catch (error) {
      if (error instanceof RateLimitError) {
        jobLogger.warn({ resetIn: error.resetIn }, "Rate limit exceeded, will retry");

        await sendWhatsAppMessage(
          sendTo,
          "Voce esta enviando muitas mensagens. Por favor, aguarde um momento antes de enviar outra.",
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

    lockId = await acquireLock(`chat:${chatId}`, LOCK_TTL_MS);
    if (!lockId) {
      jobLogger.warn("Could not acquire lock, proceeding without lock");
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

    const { getSalonRemainingCredits } = await import("../lib/services/credits.service");
    const creditsResult = await getSalonRemainingCredits(salonId);

    if ('error' in creditsResult) {
      jobLogger.error({ salonId, error: creditsResult.error }, "Failed to fetch remaining credits");
      // Fallback: If we can't find credits, we still skip AI processing to be safe and avoid overcharging
      return {
        status: "manual_mode",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
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

      await sendWhatsAppMessage(sendTo, mediaResponse, salonId);
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

    await sendWhatsAppMessage(sendTo, response.text, salonId);

    const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);

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
          await sendWhatsAppMessage(sendTo, exhaustedMessage, salonId);
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
        await sendWhatsAppMessage(sendTo, errorMessage, salonId);
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
