/**
 * Async worker for WhatsApp message processing.
 */

import { Worker, Job, DelayedError } from "bullmq";
import { createRedisClientForBullMQ, acquireLock, releaseLock, getRedisClient, storeSentMessageContext, markReplied, isReplied } from "../lib/infra/redis";
import { MessageJobData, MessageJobResult, parseLatestJobSentinel, getQueueEvents } from "../lib/queues/message-queue";
import { recordAlert } from "../lib/services/alerts/alert.service";
import { enqueueDeliveryRetry } from "../lib/queues/delivery-retry-queue";
import { logger, createContextLogger, getReplicaId } from "../lib/infra/logger";
import { StageTimer } from "../lib/infra/stage-timer";
import { generateAIResponse } from "../lib/services/ai/generate-response.service";
import { processMedia } from "../lib/services/ai/media-processor.service";
import { saveMessage, setMessageMediaPath } from "../lib/services/chat.service";
import { uploadWhatsappMedia } from "../lib/supabase/storage";
import {
  isSessionError,
  getSessionErrorReason,
  WhatsAppMessageError,
} from "../lib/services/evolution/evolution-message.service";
import { restartInstance } from "../lib/services/evolution/evolution-instance.service";
import { getProviderForJob, type MessageProvider } from "../lib/services/messaging";
import { db, chats, salons as salonsTable, domainServices, eq } from "@repo/db";
import { WhatsAppError, getUserFriendlyMessage } from "../lib/errors";
import { withTimeout } from "../lib/utils/async.utils";
import { WhatsAppMetrics } from "../lib/infra/metrics";
import {
  detectOptOutIntent,
  OPT_OUT_CONFIRMATION_MESSAGE,
  OPT_IN_CONFIRMATION_MESSAGE,
} from "../lib/services/retention/opt-out-detector";
import {
  ensureRetentionContainer,
  getRecordCustomerOptOutUseCase,
  getFlagSuspectedOptOutUseCase,
} from "../lib/services/retention/retention-container";
import { container as mcpContainer, TOKENS as MCP_TOKENS } from "@repo/mcp-server";
import type { IRetentionRepository } from "@repo/mcp-server";

const QUEUE_NAME = "whatsapp-messages";
const LOCK_TTL_MS = 120000;
const AI_TIMEOUT_MS = 90000;
const CONCURRENCY = 10;
const SESSION_RECOVERY_LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Persiste a mídia recebida do cliente (foto/áudio) no Storage privado e anexa o
 * caminho à mensagem, para o painel exibir. Nunca lança — falha aqui não pode
 * impedir a resposta da IA.
 */
async function persistInboundMedia(
  media: { buffer?: Buffer; mimeType?: string },
  mediaType: "image" | "audio" | "video" | "document",
  userMessageId: string | undefined,
  salonId: string,
  chatId: string,
): Promise<void> {
  if (!media.buffer || !userMessageId) return;
  try {
    const path = await uploadWhatsappMedia({
      salonId,
      chatId,
      messageId: userMessageId,
      buffer: media.buffer,
      mimeType: media.mimeType,
      mediaType,
    });
    if (path) {
      await setMessageMediaPath(userMessageId, path);
      logger.info({ path, mediaType, chatId }, "Mídia do cliente salva no Storage");
    }
  } catch (err) {
    logger.warn({ err, chatId }, "Falha ao salvar mídia no Storage (não bloqueia a resposta)");
  }
}

// Liveness do worker: enquanto o processo está vivo, refresca uma chave no Redis.
// Se ela expirar (sem refresh), o /health e o cron health-watch detectam que o
// worker (ponto único na Railway) caiu. TTL > 2x o intervalo para tolerar atrasos.
const WORKER_HEARTBEAT_KEY = "worker:heartbeat";
const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
const WORKER_HEARTBEAT_TTL_S = 30;

function startWorkerHeartbeat(): NodeJS.Timeout {
  const write = async () => {
    try {
      await getRedisClient().set(
        WORKER_HEARTBEAT_KEY,
        JSON.stringify({ replica: getReplicaId(), at: new Date().toISOString() }),
        "EX",
        WORKER_HEARTBEAT_TTL_S
      );
    } catch (err) {
      logger.warn({ err }, "Failed to write worker heartbeat");
    }
  };
  void write();
  const timer = setInterval(write, WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return timer;
}

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
 * Envia uma resposta da IA e registra o contexto de entrega no Redis para que,
 * se a entrega falhar depois (evento messages.update status:0), a escala de
 * reenvio consiga reconstruir o que reenviar.
 *
 * Retorna o messageId da Evolution para persistir como providerMessageId na
 * linha da mensagem (permite o painel mostrar "não entregue").
 */
async function deliverReply(opts: {
  provider: MessageProvider;
  sendTo: string;
  text: string;
  salonId: string;
  agentId: string;
  chatId: string;
  instanceName: string;
}): Promise<string | undefined> {
  const result = await opts.provider.sendText({
    to: opts.sendTo,
    body: opts.text,
    salonId: opts.salonId,
    agentId: opts.agentId,
  });
  const messageId = result?.messageId;
  // Tracking is best-effort: a missing messageId just disables delivery-retry for
  // this one reply — it must never break the send/save pipeline.
  //
  // O watchdog + escada de reenvio (status:0) é específico da Evolution. No Cloud,
  // o status de entrega chega por webhook (sent/delivered/read/failed) — não montar.
  if (messageId && opts.provider.kind === "evolution") {
    try {
      await storeSentMessageContext(
        messageId,
        {
          chatId: opts.chatId,
          salonId: opts.salonId,
          agentId: opts.agentId,
          sendTo: opts.sendTo,
          text: opts.text,
          attempt: 1,
          rootMessageId: messageId,
        },
        opts.instanceName
      );
      // Watchdog por prazo: se em ~90s não houver confirmação de entrega (nem
      // status:0 que dispara a escada), alerta. Remove a dependência de a
      // Evolution emitir o ack — sem auto-reenvio (evita envio duplicado).
      await enqueueDeliveryRetry(
        {
          failedMessageId: messageId,
          rootMessageId: messageId,
          chatId: opts.chatId,
          salonId: opts.salonId,
          agentId: opts.agentId,
          instanceName: opts.instanceName,
          recipientJid: opts.sendTo,
          originalText: opts.text,
          attempt: 1,
          watchdog: true,
        },
        { delayMs: 90_000, idSuffix: "watchdog" }
      );
    } catch (err) {
      logger.warn(
        { err, chatId: opts.chatId },
        "Failed to store sent message context (delivery retry disabled for this message)"
      );
    }
  }
  return messageId;
}

/**
 * Envia uma mensagem de aviso ao cliente quando a assinatura do salão está inativa.
 * Usa um TTL no Redis para evitar spam: envia no máximo uma vez a cada 24h por chat.
 */
async function notifyClientSubscriptionBlocked(
  provider: MessageProvider,
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

    await provider.sendText({ to: sendTo, body: message, salonId, agentId });
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
  } = job.data;
  // isNewCustomer pode vir do webhook (legado) ou ser calculado aqui no worker.
  // A partir desta versao calculamos no worker em paralelo com credits para nao
  // segurar o webhook com chamada a IA.
  let isNewCustomer: boolean | undefined = job.data.isNewCustomer;

  const instanceName = job.data.instanceName || "unknown";
  const remoteJid = job.data.remoteJid || clientPhone;
  const remoteJidAlt = job.data.remoteJidAlt;
  const addressingMode =
    job.data.addressingMode || (remoteJid.endsWith("@lid") ? "lid" : "jid");

  const sendTo = replyToJid || remoteJid || clientPhone;

  // Provedor de envio derivado do job: 'cloud' -> CloudProvider, senão Evolution.
  // O mesmo canal que recebeu a mensagem responde. replyText é o atalho para os
  // envios simples (avisos/fallbacks); a resposta principal vai por deliverReply.
  const provider = getProviderForJob({ provider: job.data.provider, phoneNumberId: job.data.phoneNumberId });
  const replyText = (text: string) =>
    provider.sendText({ to: sendTo, body: text, salonId, agentId });

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

  // Stage timer: mede o tempo de cada etapa do processamento.
  // `queue_wait_ms` = tempo entre enqueue (job.timestamp) e pickup pelo worker (startTime).
  //   Inclui debounce + espera na fila. Se > 5s, temos backlog/limiter apertado.
  // `delay_ms` = o delay configurado no enqueue (CHAT_DEBOUNCE_MS = 1500 por default).
  const queueWaitMs = job.processedOn ? job.processedOn - job.timestamp : startTime - job.timestamp;
  const timer = new StageTimer("worker", {
    messageId,
    chatId,
    salonId,
    jobId: job.id,
  });

  try {
    jobLogger.info(
      {
        queueWaitMs,
        debounceDelayMs: job.opts.delay ?? 0,
        attempt: job.attemptsMade + 1,
      },
      "Processing message job"
    );

    // ETAPA 0: Opt-out detection (only for text bodies; runs before coalescing
    // because opt-out is a critical action that should not be dropped if a
    // newer message arrives in the same chat).
    if (!hasMedia && body) {
      const intent = detectOptOutIntent(body);
      if (intent === "hard_opt_out") {
        try {
          ensureRetentionContainer();
          const useCase = getRecordCustomerOptOutUseCase();
          const result = await useCase.execute({
            salonId,
            phone: clientPhone,
            reason: body.slice(0, 200),
            source: "keyword",
          });
          if (result.success) {
            jobLogger.info(
              { customerId: result.data.customerId, alreadyOptedOut: result.data.alreadyOptedOut },
              "Customer hard-opted-out via WhatsApp keyword"
            );
          } else {
            jobLogger.warn({ err: result.error.message }, "RecordCustomerOptOutUseCase failed");
          }
          await deliverReply({ provider, sendTo, text: OPT_OUT_CONFIRMATION_MESSAGE, salonId, agentId, chatId, instanceName });
        } catch (err) {
          jobLogger.error({ err }, "Failed to process hard opt-out");
        }
        timer.flush(jobLogger, { outcome: "opt_out", queueWaitMs });
        return {
          status: "opt_out",
          chatId,
          messageId,
          duration: Date.now() - startTime,
        };
      }
      if (intent === "opt_in") {
        try {
          ensureRetentionContainer();
          const repo = mcpContainer.resolve<IRetentionRepository>(MCP_TOKENS.RetentionRepository);
          const cleared = await repo.clearOptOut(salonId, clientPhone);
          if (cleared) {
            await deliverReply({ provider, sendTo, text: OPT_IN_CONFIRMATION_MESSAGE, salonId, agentId, chatId, instanceName });
            jobLogger.info({}, "Customer opt-in restored");
            timer.flush(jobLogger, { outcome: "opt_in", queueWaitMs });
            return {
              status: "opt_in",
              chatId,
              messageId,
              duration: Date.now() - startTime,
            };
          }
        } catch (err) {
          jobLogger.error({ err }, "Failed to process opt-in");
        }
      }
      if (intent === "soft_signal" && customerId) {
        // Fire-and-forget: only flags if there was a recent AI retention message.
        // Does NOT short-circuit the pipeline — the AI conversation continues.
        (async () => {
          try {
            ensureRetentionContainer();
            const repo = mcpContainer.resolve<IRetentionRepository>(MCP_TOKENS.RetentionRepository);
            const recent = await repo.hasRecentAiMessage(customerId, 72);
            if (!recent) return;
            const flagUC = getFlagSuspectedOptOutUseCase();
            await flagUC.execute({
              salonId,
              customerId,
              phone: clientPhone,
              responseBody: body.slice(0, 2000),
              retentionCampaignMessageId: recent.campaignMessageId,
            });
            jobLogger.info({ customerId, recentRetentionId: recent.campaignMessageId }, "Soft opt-out signal flagged for review");
          } catch (err) {
            jobLogger.warn({ err }, "Failed to flag soft opt-out signal (non-blocking)");
          }
        })();
      }
    }

    // Rate limiting é feito no webhook (antes de enfileirar).
    // Não verificar aqui novamente — causaria double-count no Redis e
    // dispararia avisos desnecessários ao cliente.

    // ETAPA 1: Coalescing check ANTES do lock.
    // Se uma mensagem mais recente ja chegou para este chat, este job nunca vai
    // gerar resposta de IA - vai ser descartado de qualquer forma. Descartar agora
    // evita esperar 60s no moveToDelayed quando o lock estiver ocupado.
    //
    // Comparamos por TIMESTAMP da mensagem (receivedAt), nao por messageId.
    // Razao: webhook tem latencia variavel (~3-6s), entao a ordem de SET no
    // sentinel pode inverter a ordem real de chegada. Comparar por timestamp
    // garante que a mensagem mais nova cronologicamente vence.
    const myReceivedAtMs = new Date(job.data.receivedAt).getTime();
    const redis = getRedisClient();
    const sentinelRaw = await redis.get(`chat:latest-job:${chatId}`);
    timer.mark("coalescing_checked");
    const sentinel = parseLatestJobSentinel(sentinelRaw);
    // Sou "antigo" (deve ser coalesced) somente se:
    //   - existe sentinel
    //   - sentinel.messageId nao sou eu
    //   - sentinel.timestamp > meu timestamp (sentinel e mais novo)
    // Quando timestamps empatam ou sentinel nao tem timestamp (formato antigo),
    // fica safe e processa.
    if (
      sentinel
      && sentinel.messageId !== messageId
      && sentinel.timestampMs > 0
      && sentinel.timestampMs > myReceivedAtMs
    ) {
      jobLogger.info(
        { latestMessageId: sentinel.messageId, latestTs: sentinel.timestampMs, myTs: myReceivedAtMs, savedMs: 60_000 },
        "Message coalesced before lock attempt — newer message will handle the response"
      );
      timer.flush(jobLogger, { outcome: "coalesced_pre_lock", queueWaitMs });
      return {
        status: "coalesced",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    // ETAPA 2: Adquirir lock. Somos a mensagem mais recente do chat.
    lockId = await acquireLock(`chat:${chatId}`, LOCK_TTL_MS);
    timer.mark("lock_tried");
    if (!lockId) {
      // Lock ocupado por outra mensagem (provavelmente uma anterior do mesmo chat
      // ainda em processamento). Como NOS somos o latest, vamos esperar - mas em vez
      // de 60s usamos 10s, ja que a maioria dos jobs termina em ate 25s e o lock
      // expira em LOCK_TTL_MS=120s mesmo no pior caso.
      const retryDelay = 10_000;
      jobLogger.info(
        { chatId, lockTtlMs: LOCK_TTL_MS, retryIn: retryDelay },
        "Chat lock unavailable — rescheduling job for later (we are the latest message)."
      );
      await job.moveToDelayed(Date.now() + retryDelay, job.token!);
      throw new DelayedError();
    }

    // ETAPA 3: Re-check coalescing apos adquirir o lock (corrida pequena mas possivel:
    // entre o check anterior e o lock, uma mensagem ainda mais nova pode ter chegado).
    const sentinelAfterLockRaw = await redis.get(`chat:latest-job:${chatId}`);
    const sentinelAfterLock = parseLatestJobSentinel(sentinelAfterLockRaw);
    if (
      sentinelAfterLock
      && sentinelAfterLock.messageId !== messageId
      && sentinelAfterLock.timestampMs > 0
      && sentinelAfterLock.timestampMs > myReceivedAtMs
    ) {
      jobLogger.info(
        { latestMessageId: sentinelAfterLock.messageId, latestTs: sentinelAfterLock.timestampMs, myTs: myReceivedAtMs },
        "Message coalesced after lock — newer message arrived during lock acquisition"
      );
      timer.flush(jobLogger, { outcome: "coalesced_post_lock", queueWaitMs });
      return {
        status: "coalesced",
        chatId,
        messageId,
        duration: Date.now() - startTime,
      };
    }

    // Idempotência de resposta: se ESTE job já foi respondido (re-execução por
    // stalled/retry do BullMQ após um envio bem-sucedido), não gerar/enviar de novo.
    if (await isReplied(messageId)) {
      jobLogger.info("Inbound message already replied — skipping to avoid double-send");
      timer.flush(jobLogger, { outcome: "already_replied", queueWaitMs });
      return { status: "success", chatId, messageId, duration: Date.now() - startTime };
    }

    const chatRecord = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { isManual: true },
    });
    timer.mark("chat_record_loaded");

    if (chatRecord?.isManual) {
      jobLogger.info("Chat in manual mode, skipping AI processing");
      timer.flush(jobLogger, { outcome: "manual_mode", queueWaitMs });
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
    timer.mark("subscription_checked");

    if (!salonRecord || salonRecord.subscriptionStatus === 'CANCELED') {
      jobLogger.info({ salonId, status: salonRecord?.subscriptionStatus }, "Salon subscription inactive, skipping AI processing");
      await notifyClientSubscriptionBlocked(provider, sendTo, salonId, agentId, 'canceled', jobLogger);
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
        await notifyClientSubscriptionBlocked(provider, sendTo, salonId, agentId, 'past_due', jobLogger);
        return {
          status: "manual_mode",
          chatId,
          messageId,
          duration: Date.now() - startTime,
        };
      }
    }

    const { getSalonRemainingCredits } = await import("../lib/services/credits.service");
    const { checkIfNewCustomer } = await import("../lib/services/ai/generate-response.service");

    // Paralelo: credits + isNewCustomer (era pago no webhook). Se ja veio do payload
    // (compatibilidade com jobs antigos), pula a chamada.
    const [creditsResult, isNewCustomerComputed] = await Promise.all([
      getSalonRemainingCredits(salonId),
      isNewCustomer === undefined
        ? checkIfNewCustomer(salonId, clientPhone).catch((err) => {
            jobLogger.warn({ err }, "checkIfNewCustomer failed, defaulting to false");
            return false;
          })
        : Promise.resolve(isNewCustomer),
    ]);
    isNewCustomer = isNewCustomerComputed;
    timer.mark("credits_and_new_customer_checked");

    if ('error' in creditsResult) {
      jobLogger.error({ salonId, error: creditsResult.error }, "Failed to fetch remaining credits, will retry");
      throw new Error(`Credits check failed: ${creditsResult.error}`);
    }

    // Aviso "soft" (não bloqueia): créditos abaixo de 5% do total.
    if (creditsResult.total > 0 && creditsResult.remaining > 0 && creditsResult.remaining < creditsResult.total * 0.05) {
      void recordAlert({
        scope: "salon",
        salonId,
        type: "credits_low",
        severity: "warning",
        title: "Créditos quase no fim (menos de 5% restante)",
        detail: { remaining: creditsResult.remaining, total: creditsResult.total },
        throttleSeconds: 6 * 60 * 60,
      });
    }

    if (creditsResult.remaining <= 0) {
      jobLogger.info({ salonId, total: creditsResult.total, used: creditsResult.used }, "Salon out of credits, skipping AI processing");
      // Avisa o cliente (throttled 24h por chat) em vez de silêncio total, e alerta o salão.
      try {
        const redis = getRedisClient();
        const notified = await redis.set(`credits:blocked:${salonId}:${sendTo}`, "1", "EX", 60 * 60 * 24, "NX");
        if (notified !== null) {
          await replyText(
            "Olá! No momento nosso atendimento automatizado está temporariamente indisponível. Em breve retornaremos. Obrigado pela compreensão!"
          );
        }
      } catch (err) {
        jobLogger.warn({ err }, "Failed to send out-of-credits notice to client");
      }
      void recordAlert({
        scope: "salon",
        salonId,
        type: "out_of_credits",
        severity: "critical",
        title: "Salão sem créditos — IA pausada, clientes sem resposta automática",
        detail: { total: creditsResult.total, used: creditsResult.used },
      });
      timer.flush(jobLogger, { outcome: "out_of_credits", queueWaitMs });
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

      // Imagens: enviadas ao modelo com vision (ex: comprovantes de pagamento)
      if (mediaType === "image") {
        const media = await processMedia({
          mediaType: "image",
          mediaUrl: permanentMediaUrl || "",
          mediaId: job.data.mediaId,
          instanceName,
          messageKey: { remoteJid, fromMe: false, id: messageId },
        });
        timer.mark("media_processed_image");
        await persistInboundMedia(media, "image", job.data.userMessageId, salonId, chatId);

        const caption = body && body !== "[IMAGE]" ? body : "";
        const imageContext = caption
          ? caption
          : "O cliente enviou esta imagem. Analise o conteúdo e responda adequadamente.";

        jobLogger.info({ mediaType, hasCaption: !!caption }, "Image forwarded to AI with vision");

        const response = await withTimeout(
          generateAIResponse({
            chatId,
            salonId,
            clientPhone,
            userMessage: imageContext,
            customerId,
            customerName,
            isNewCustomer,
            media,
          }),
          AI_TIMEOUT_MS,
          "generateAIResponse"
        );
        timer.mark("ai_response_generated");

        const providerMessageId = await deliverReply({ provider, sendTo, text: response.text, salonId, agentId, chatId, instanceName });
        await markReplied(messageId);
        timer.mark("whatsapp_sent");

        const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);
        await saveMessage(chatId, "assistant", response.text, {
          requiresResponse: requiresResponse !== false,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
          totalTokens: response.usage?.totalTokens,
          model: response.model,
          toolSummary: response.toolSummary,
          providerMessageId,
          deliveryStatus: "sent",
        });

        if (response.usage?.totalTokens && response.usage.totalTokens > 0) {
          const { debitSalonCredits } = await import("../lib/services/credits.service");
          await debitSalonCredits(salonId, response.usage.totalTokens, response.model ?? "unknown");
        }

        jobLogger.info(
          { mediaType, tokensUsed: response.usage?.totalTokens, processingMs: media.metadata.processingTimeMs },
          "Image message handled via AI vision"
        );

        timer.flush(jobLogger, {
          outcome: "success_image",
          queueWaitMs,
          tokensUsed: response.usage?.totalTokens,
          mediaProcessingMs: media.metadata.processingTimeMs,
        });

        return {
          status: "success",
          chatId,
          messageId,
          responseText: response.text,
          duration: Date.now() - startTime,
        };
      }

      // Áudio: transcrição via Whisper + resposta da IA
      if (mediaType === "audio") {
        const media = await processMedia({
          mediaType: "audio",
          mediaUrl: permanentMediaUrl || "",
          mediaId: job.data.mediaId,
          instanceName,
          messageKey: { remoteJid, fromMe: false, id: messageId },
        });
        timer.mark("media_processed_audio");
        await persistInboundMedia(media, "audio", job.data.userMessageId, salonId, chatId);

        if (!media.transcribedText) {
          const fallback = "Desculpe, não consegui processar seu áudio. Poderia enviar como texto?";
          await replyText(fallback);
          await saveMessage(chatId, "assistant", fallback);

          jobLogger.warn({ mediaType, processingMs: media.metadata.processingTimeMs }, "Audio transcription failed");

          return {
            status: "media_handled",
            chatId,
            messageId,
            responseText: fallback,
            duration: Date.now() - startTime,
          };
        }

        jobLogger.info(
          { mediaType, transcriptionLength: media.transcribedText.length, processingMs: media.metadata.processingTimeMs },
          "Audio transcribed successfully"
        );

        const audioContext = `[Mensagem de voz do cliente]: "${media.transcribedText}"`;

        const response = await withTimeout(
          generateAIResponse({
            chatId,
            salonId,
            clientPhone,
            userMessage: audioContext,
            customerId,
            customerName,
            isNewCustomer,
          }),
          AI_TIMEOUT_MS,
          "generateAIResponse"
        );
        timer.mark("ai_response_generated");

        const providerMessageId = await deliverReply({ provider, sendTo, text: response.text, salonId, agentId, chatId, instanceName });
        await markReplied(messageId);
        timer.mark("whatsapp_sent");

        const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);
        await saveMessage(chatId, "assistant", response.text, {
          requiresResponse: requiresResponse !== false,
          inputTokens: response.usage?.inputTokens,
          outputTokens: response.usage?.outputTokens,
          totalTokens: response.usage?.totalTokens,
          model: response.model,
          toolSummary: response.toolSummary,
          providerMessageId,
          deliveryStatus: "sent",
        });

        if (response.usage?.totalTokens && response.usage.totalTokens > 0) {
          const { debitSalonCredits } = await import("../lib/services/credits.service");
          await debitSalonCredits(salonId, response.usage.totalTokens, response.model ?? "unknown");
        }
        timer.mark("saved_and_debited");

        jobLogger.info(
          { mediaType, tokensUsed: response.usage?.totalTokens, processingMs: media.metadata.processingTimeMs },
          "Audio message handled via transcription + AI"
        );

        timer.flush(jobLogger, {
          outcome: "success_audio",
          queueWaitMs,
          tokensUsed: response.usage?.totalTokens,
          mediaProcessingMs: media.metadata.processingTimeMs,
        });

        return {
          status: "success",
          chatId,
          messageId,
          responseText: response.text,
          duration: Date.now() - startTime,
        };
      }

      // Vídeo/Documento: resposta genérica
      const mediaResponse = await handleMediaMessage(mediaType, permanentMediaUrl);

      await replyText(mediaResponse);
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
    timer.mark("ai_response_generated");

    const providerMessageId = await deliverReply({ provider, sendTo, text: response.text, salonId, agentId, chatId, instanceName });
    await markReplied(messageId);
    timer.mark("whatsapp_sent");

    const requiresResponse = domainServices.analyzeMessageRequiresResponse(response.text);

    await saveMessage(chatId, "assistant", response.text, {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      totalTokens: response.usage.totalTokens,
      model: response.model,
      requiresResponse,
      toolSummary: response.toolSummary,
      providerMessageId,
      deliveryStatus: "sent",
    });

    // Debita os tokens usados do saldo mensal do salão
    if (response.usage.totalTokens > 0) {
      const { debitSalonCredits } = await import("../lib/services/credits.service");
      await debitSalonCredits(salonId, response.usage.totalTokens, response.model ?? "unknown");
    }
    timer.mark("saved_and_debited");

    const duration = Date.now() - startTime;

    jobLogger.info(
      {
        duration,
        tokensUsed: response.usage.totalTokens,
        responseLength: response.text.length,
      },
      "Message processed successfully"
    );

    // Log final agregado: breakdown por stage + queue wait + tokens.
    // Para investigar latencia, busque por `pipeline=worker` e compare `queueWaitMs` vs `totalMs`
    // vs o tempo do stage ai_response_generated.
    timer.flush(jobLogger, {
      outcome: "success",
      queueWaitMs,
      tokensUsed: response.usage.totalTokens,
      model: response.model,
    });

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
          await replyText(exhaustedMessage);
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
        await replyText(errorMessage);
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
          await replyText(errorMessage);
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

    // Tentativas esgotadas para QUALQUER outro erro (timeout, AIGenerationError, etc.):
    // não deixar o cliente sem nada. Envia fallback, passa o chat pro manual e alerta.
    if (currentAttempt >= maxAttempts) {
      const fallback =
        error instanceof WhatsAppError
          ? getUserFriendlyMessage(error)
          : "Desculpe, tive uma instabilidade técnica agora. Já avisei a equipe e em breve retornamos. 🙏";
      try {
        await replyText(fallback);
        await saveMessage(chatId, "assistant", fallback);
      } catch (sendError) {
        jobLogger.error({ err: sendError }, "Failed to send terminal fallback to client");
      }
      try {
        await db.update(chats).set({ isManual: true, updatedAt: new Date() }).where(eq(chats.id, chatId));
      } catch (flipErr) {
        jobLogger.error({ err: flipErr }, "Failed to flip chat to manual after exhaustion");
      }
      void recordAlert({
        scope: "salon",
        salonId,
        type: "ai_processing_exhausted",
        severity: "critical",
        title: "Falha ao gerar/enviar resposta após todas as tentativas — chat em manual",
        detail: { chatId, error: error instanceof Error ? error.message : String(error) },
      });
      return {
        status: "error",
        chatId,
        messageId,
        duration,
        error: error instanceof Error ? error.message : "exhausted",
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

  if (permanentUrl) {
    logger.debug({ mediaType, hasUrl: true }, "Media stored for future processing");
  }

  return "Olá! No momento, aceitamos apenas mensagens de texto. Recebi um formato diferente e não consigo processá-lo. Por favor, envie sua mensagem digitada. Obrigado!";
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
    // Alerta operacional (throttled) — um job esgotado = um cliente sem resposta.
    void recordAlert({
      scope: "global",
      type: "queue_job_failed",
      severity: "critical",
      title: "Job de mensagem falhou após todas as tentativas",
      detail: { jobId: job?.id, messageId: job?.data.messageId, error: error.message, attempts: job?.attemptsMade },
    });
  });

  worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "Job stalled");
    void recordAlert({
      scope: "global",
      type: "job_stalled",
      severity: "warning",
      title: "Job de mensagem travou (stalled)",
      detail: { jobId },
    });
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "Worker error");
    void recordAlert({
      scope: "global",
      type: "worker_error",
      severity: "critical",
      title: "Erro no worker de mensagens",
      detail: { error: error.message },
    });
  });

  // Liveness + observabilidade da fila (QueueEvents estava definido mas nunca iniciado).
  const heartbeat = startWorkerHeartbeat();
  worker.on("closing", () => clearInterval(heartbeat));
  getQueueEvents();

  logger.info({ queue: QUEUE_NAME, concurrency: CONCURRENCY }, "Message worker started");

  return worker;
}

if (require.main === module) {
  logger.info("Starting message processor worker...");

  const worker = createMessageWorker();

  // Also start the Trinks profile sync worker in the same process — same Redis
  // connection, lower concurrency, no impact on message-processing throughput.
  let trinksWorker: { close(): Promise<void> } | null = null;
  let deliveryRetryWorker: { close(): Promise<void> } | null = null;
  (async () => {
    try {
      const { createTrinksProfileSyncWorker } = await import("./trinks-profile-sync.worker");
      trinksWorker = createTrinksProfileSyncWorker();
    } catch (err) {
      logger.error({ err }, "Failed to start Trinks profile sync worker");
    }
    try {
      const { createDeliveryRetryWorker } = await import("./delivery-retry.worker");
      deliveryRetryWorker = createDeliveryRetryWorker();
    } catch (err) {
      logger.error({ err }, "Failed to start delivery-retry worker");
    }
  })();

  const shutdown = async () => {
    logger.info("Shutting down workers...");
    await worker.close();
    if (trinksWorker) await trinksWorker.close();
    if (deliveryRetryWorker) await deliveryRetryWorker.close();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { processMessage };
