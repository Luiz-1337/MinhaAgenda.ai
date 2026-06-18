/**
 * Background worker for the outbound WhatsApp delivery-failure escalation ladder.
 *
 * Listens on the whatsapp-delivery-retry queue. Each job is one rung of the
 * ladder for a reply that failed to deliver (status:0). Driven by `attempt`
 * (the failure number):
 *
 *   attempt 1            → resend
 *   attempt 2 (phase A)  → restart the Evolution instance (heal Signal session)
 *   attempt 2 (phase B)  → after the instance reconnects, resend
 *   attempt 3            → give up: hand the chat to manual control + mark undelivered
 *
 * Each resend produces a NEW Evolution messageId, which we re-register in the
 * correlation store so its eventual status:0/delivered re-enters this ladder.
 *
 * Started together with the WhatsApp message worker — same process, same Redis
 * connection. See instrumentation.ts and the worker:start script.
 */

import { Worker, Job } from "bullmq";
import {
  createRedisClientForBullMQ,
  acquireLock,
  storeSentMessageContext,
  getSentMessageContext,
} from "../lib/infra/redis";
import { recordAlert } from "../lib/services/alerts/alert.service";
import { createContextLogger, logger } from "../lib/infra/logger";
import {
  DELIVERY_RETRY_QUEUE_NAME,
  DeliveryRetryJobData,
  DeliveryRetryJobResult,
  enqueueDeliveryRetry,
} from "../lib/queues/delivery-retry-queue";
import { sendWhatsAppMessage } from "../lib/services/evolution/evolution-message.service";
import { restartInstance, getInstanceStatus } from "../lib/services/evolution/evolution-instance.service";
import { WhatsAppMetrics } from "../lib/infra/metrics";
import { db, chats, messages, eq } from "@repo/db";

const CONCURRENCY = 3;
// Evolution instance restart needs ~30s+ for the Signal session to reconnect.
const POST_RESTART_WAIT_MS = 40_000;
// If still not connected when we go to resend, wait and re-check this often.
const RECONNECT_RETRY_MS = 15_000;
const MAX_RECONNECT_WAITS = 3;
// Reuse the same recovery resource key as the inbound path's triggerSessionRecovery
// so a burst of failures (inbound + outbound) doesn't restart the instance repeatedly.
const RESTART_LOCK_TTL_MS = 10 * 60 * 1000;

type LadderLogger = ReturnType<typeof createContextLogger>;

/** Restart the Evolution instance under a cooldown lock (mirrors triggerSessionRecovery). */
async function triggerInstanceRestart(instanceName: string, log: LadderLogger): Promise<void> {
  const lockId = await acquireLock(`session:recover:${instanceName}`, RESTART_LOCK_TTL_MS);
  if (!lockId) {
    log.warn({ instanceName }, "Instance restart already in progress or in cooldown — skipping");
    return;
  }
  try {
    await restartInstance(instanceName);
    log.warn({ instanceName }, "Delivery ladder: Evolution instance restarted to heal session");
  } catch (err) {
    log.error({ err, instanceName }, "Delivery ladder: failed to restart instance");
  }
  // Intentionally keep the lock until TTL to act as a cooldown (avoid restart loops).
}

/** Update the original message row's delivery status (best-effort). */
async function markDeliveryStatus(
  rootMessageId: string | null,
  status: "retrying" | "undelivered",
  attempts: number,
  log: LadderLogger
): Promise<void> {
  if (!rootMessageId) return;
  try {
    await db
      .update(messages)
      .set({ deliveryStatus: status, deliveryAttempts: attempts })
      .where(eq(messages.providerMessageId, rootMessageId));
  } catch (err) {
    log.warn({ err, rootMessageId, status }, "Delivery ladder: failed to update message delivery status");
  }
}

/** Final rung: stop retrying, hand the chat to a human, flag the message undelivered. */
async function handoffToManual(d: DeliveryRetryJobData, log: LadderLogger): Promise<void> {
  try {
    await db.update(chats).set({ isManual: true, updatedAt: new Date() }).where(eq(chats.id, d.chatId));
  } catch (err) {
    log.error({ err, chatId: d.chatId }, "Delivery ladder: failed to flip chat to manual mode");
  }
  await markDeliveryStatus(d.rootMessageId, "undelivered", d.attempt, log);
  WhatsAppMetrics.deliveryGaveUp({ instanceName: d.instanceName, attempts: d.attempt, reason: "ladder_exhausted" });
  await recordAlert({
    scope: "salon",
    salonId: d.salonId,
    type: "delivery_undelivered",
    severity: "critical",
    title: "Resposta não entregue ao cliente — chat em controle manual",
    detail: { chatId: d.chatId, attempts: d.attempt },
  });
  log.warn(
    { chatId: d.chatId, rootMessageId: d.rootMessageId, attempts: d.attempt },
    "Delivery ladder exhausted — chat handed to manual control (undelivered)"
  );
}

/** Resend the reply and re-register the new messageId so its status re-enters the ladder. */
async function resend(d: DeliveryRetryJobData, log: LadderLogger): Promise<DeliveryRetryJobResult> {
  // Gate on a LIVE connection check (resolveEvolutionInstance's DB column lags a restart).
  const status = await getInstanceStatus(d.instanceName).catch(() => null);
  if (status !== "connected") {
    const waits = d.reconnectWaits ?? 0;
    if (waits < MAX_RECONNECT_WAITS) {
      log.info({ instanceName: d.instanceName, status, waits }, "Delivery ladder: instance not connected yet — waiting");
      await enqueueDeliveryRetry(
        { ...d, reconnectWaits: waits + 1 },
        { delayMs: RECONNECT_RETRY_MS, idSuffix: `wait${waits + 1}` }
      );
      return { status: "awaiting_reconnect" };
    }
    log.warn({ instanceName: d.instanceName }, "Delivery ladder: instance never reconnected — giving up");
    await handoffToManual(d, log);
    return { status: "gave_up_no_connection" };
  }

  try {
    const { messageId: newId } = await sendWhatsAppMessage(d.recipientJid, d.originalText, d.salonId, {
      agentId: d.agentId,
    });
    await storeSentMessageContext(
      newId,
      {
        chatId: d.chatId,
        salonId: d.salonId,
        agentId: d.agentId,
        sendTo: d.recipientJid,
        text: d.originalText,
        attempt: d.attempt + 1,
        rootMessageId: d.rootMessageId,
      },
      d.instanceName
    );
    await markDeliveryStatus(d.rootMessageId, "retrying", d.attempt, log);
    WhatsAppMetrics.deliveryRetry({ instanceName: d.instanceName, ladderStep: d.attempt, viaRestart: !!d.viaRestart });
    log.info({ newMessageId: newId, ladderStep: d.attempt, viaRestart: !!d.viaRestart }, "Delivery ladder: resent");
    return { status: "resent", newMessageId: newId };
  } catch (err) {
    log.warn({ err, ladderStep: d.attempt }, "Delivery ladder: resend threw");
    // A synchronous send failure is another failure — escalate to restart, or give up.
    if (d.attempt < 2) {
      await enqueueDeliveryRetry({ ...d, attempt: 2, viaRestart: false }, { delayMs: 1_000, idSuffix: "escalate" });
    } else {
      await handoffToManual(d, log);
    }
    return { status: "resend_error" };
  }
}

async function processDeliveryRetry(
  job: Job<DeliveryRetryJobData, DeliveryRetryJobResult>
): Promise<DeliveryRetryJobResult> {
  const d = job.data;
  const log = createContextLogger({
    jobId: job.id,
    failedMessageId: d.failedMessageId,
    rootMessageId: d.rootMessageId,
    chatId: d.chatId,
    salonId: d.salonId,
    instanceName: d.instanceName,
    ladderStep: d.attempt,
    viaRestart: !!d.viaRestart,
    watchdog: !!d.watchdog,
  });

  // Watchdog (agendado no envio): se o contexto ainda existe, nenhuma confirmação
  // de entrega chegou na janela. NÃO reenviamos (evita envio duplicado quando os
  // acks simplesmente não estão fluindo) — apenas alertamos para um humano olhar.
  // O reenvio automático continua dependendo do sinal POSITIVO status:0.
  if (d.watchdog) {
    const ctx = await getSentMessageContext(d.failedMessageId, d.instanceName);
    if (!ctx) {
      // Entregue (status>=2 limpou) ou já entrou na escada (status:0 limpou).
      return { status: "confirmed" };
    }
    await recordAlert({
      scope: "salon",
      salonId: d.salonId,
      type: "delivery_unconfirmed",
      severity: "warning",
      title: "Resposta enviada sem confirmação de entrega",
      detail: { chatId: d.chatId, rootMessageId: d.rootMessageId },
    });
    log.warn({ chatId: d.chatId, rootMessageId: d.rootMessageId }, "Delivery watchdog: no confirmation within window");
    return { status: "unconfirmed" };
  }

  // Rung 3: the post-restart resend also failed → stop and hand to a human.
  if (d.attempt >= 3) {
    await handoffToManual(d, log);
    return { status: "gave_up" };
  }

  // Rung 2, phase A: the first resend failed → restart the instance, then schedule
  // the post-restart resend after the reconnect window.
  if (d.attempt === 2 && !d.viaRestart) {
    await triggerInstanceRestart(d.instanceName, log);
    WhatsAppMetrics.deliveryRetry({ instanceName: d.instanceName, ladderStep: 2, viaRestart: true });
    await enqueueDeliveryRetry(
      { ...d, viaRestart: true, reconnectWaits: 0 },
      { delayMs: POST_RESTART_WAIT_MS, idSuffix: "restart" }
    );
    return { status: "restart_triggered" };
  }

  // Rung 1 (plain resend) OR rung 2 phase B (post-restart resend).
  return resend(d, log);
}

export function createDeliveryRetryWorker(): Worker<DeliveryRetryJobData, DeliveryRetryJobResult> {
  const connection = createRedisClientForBullMQ();

  const worker = new Worker<DeliveryRetryJobData, DeliveryRetryJobResult>(
    DELIVERY_RETRY_QUEUE_NAME,
    processDeliveryRetry,
    {
      connection,
      concurrency: CONCURRENCY,
      limiter: { max: 30, duration: 60_000 },
    }
  );

  worker.on("completed", (job, result) => {
    logger.debug(
      { jobId: job.id, failedMessageId: job.data.failedMessageId, status: result.status },
      "Delivery-retry job completed"
    );
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, failedMessageId: job?.data.failedMessageId, err: err.message },
      "Delivery-retry job failed"
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Delivery-retry worker error");
  });

  logger.info(
    { queue: DELIVERY_RETRY_QUEUE_NAME, concurrency: CONCURRENCY },
    "Delivery-retry worker started"
  );

  return worker;
}
