/**
 * BullMQ queue for the outbound WhatsApp delivery-failure escalation ladder.
 *
 * Fed by the webhook's `messages.update` branch when one of OUR sent replies
 * (fromMe:true) comes back with status:0 (ERROR) — i.e. the message was
 * accepted by Evolution (HTTP 200) but never actually delivered to the client.
 *
 * The ladder (driven by `attempt`, the failure number) is:
 *   attempt 1 → resend
 *   attempt 2 → restart the Evolution instance, wait, resend
 *   attempt 3 → give up: hand the chat to manual control + mark undelivered
 *
 * Idempotent via jobId = "delivery:<failedMessageId>[:<suffix>]" — a duplicate
 * status:0 webhook for the same message collapses to a single job.
 */

import { Queue, Job } from "bullmq";
import { getRedisClient } from "../infra/redis";
import { logger } from "../infra/logger";

export const DELIVERY_RETRY_QUEUE_NAME = "whatsapp-delivery-retry";

export interface DeliveryRetryJobData {
  /** Evolution key.id of the send that just failed (drives dedupe). */
  failedMessageId: string;
  /** Evolution key.id of the ORIGINAL send (the one with a DB row). Null if untracked. */
  rootMessageId: string | null;
  chatId: string;
  salonId: string;
  agentId: string;
  instanceName: string;
  /** Recipient JID to resend to (the original reply target — may be @lid). */
  recipientJid: string;
  /** The text to resend. */
  originalText: string;
  /** Failure number: 1 = original failed, 2 = first resend failed, 3 = post-restart resend failed. */
  attempt: number;
  /** True once the instance restart has been triggered (post-restart resend phase). */
  viaRestart?: boolean;
  /** How many times we have re-scheduled waiting for the instance to reconnect. */
  reconnectWaits?: number;
  /**
   * Watchdog job: scheduled at send time (+delay). If the sent-context still
   * exists when it runs (no delivered ack and no status:0 cleared it), the
   * delivery was never CONFIRMED — we alert (we do NOT auto-resend, to avoid
   * double-sends when acks simply aren't flowing).
   */
  watchdog?: boolean;
}

export interface DeliveryRetryJobResult {
  status:
    | "resent"
    | "restart_triggered"
    | "awaiting_reconnect"
    | "gave_up"
    | "gave_up_no_connection"
    | "resend_error"
    | "unconfirmed"
    | "confirmed"
    | "skipped";
  newMessageId?: string;
}

let deliveryQueue: Queue<DeliveryRetryJobData, DeliveryRetryJobResult> | null = null;

export function getDeliveryRetryQueue(): Queue<DeliveryRetryJobData, DeliveryRetryJobResult> {
  if (deliveryQueue) return deliveryQueue;

  const connection = getRedisClient();

  deliveryQueue = new Queue<DeliveryRetryJobData, DeliveryRetryJobResult>(DELIVERY_RETRY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // The ladder is hand-driven via explicit (delayed) re-enqueues, NOT BullMQ
      // auto-retry — every terminal path resolves to either "resent" or a manual
      // handoff, so we never want BullMQ to silently retry-and-fail a rung.
      attempts: 1,
      removeOnComplete: { age: 86_400, count: 500 },
      removeOnFail: { age: 604_800, count: 1_000 },
    },
  });

  logger.info({ queue: DELIVERY_RETRY_QUEUE_NAME }, "Delivery-retry queue initialized");
  return deliveryQueue;
}

/**
 * Enqueues a rung of the delivery-failure ladder. Safe to call from the hot
 * webhook path — never throws (returns null on failure).
 *
 * `idSuffix` distinguishes follow-up rungs (restart phase, reconnect waits) from
 * the initial enqueue so they don't collide on the dedupe jobId.
 */
export async function enqueueDeliveryRetry(
  data: DeliveryRetryJobData,
  opts?: { delayMs?: number; idSuffix?: string }
): Promise<Job<DeliveryRetryJobData, DeliveryRetryJobResult> | null> {
  if (
    !data.failedMessageId ||
    !data.chatId ||
    !data.salonId ||
    !data.instanceName ||
    !data.recipientJid
  ) {
    return null;
  }

  try {
    const queue = getDeliveryRetryQueue();
    const job = await queue.add("delivery-retry", data, {
      jobId: `delivery:${data.failedMessageId}${opts?.idSuffix ? `:${opts.idSuffix}` : ""}`,
      ...(opts?.delayMs ? { delay: opts.delayMs } : {}),
    });
    return job;
  } catch (err) {
    logger.warn({ err, failedMessageId: data.failedMessageId }, "Failed to enqueue delivery retry");
    return null;
  }
}

/** Cleanup helper for tests / shutdown. */
export async function closeDeliveryRetryQueue(): Promise<void> {
  if (deliveryQueue) {
    await deliveryQueue.close();
    deliveryQueue = null;
  }
}

export { Job as DeliveryRetryJob };
