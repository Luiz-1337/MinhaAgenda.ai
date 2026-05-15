/**
 * BullMQ queue for on-demand Trinks profile sync.
 *
 * Triggered by:
 *   - generate-response.service when a customer's profile is missing/stale
 *   - integrations server actions when the salon owner clicks "Sincronizar Clientes"
 *
 * Each job re-runs SyncCustomerTrinksProfileUseCase for one customer.
 * Idempotent via jobId = "trinks-profile:<customerId>" — duplicate enqueues
 * within BullMQ's job retention window collapse to a single execution.
 */

import { Queue, Job } from "bullmq"
import { getRedisClient } from "../infra/redis"
import { logger } from "../infra/logger"

const QUEUE_NAME = "trinks-profile-sync"

export interface TrinksProfileSyncJobData {
  salonId: string
  customerId: string
  customerPhone: string
}

export interface TrinksProfileSyncJobResult {
  status: "synced" | "not_found" | "skipped" | "error"
  error?: string
}

let trinksQueue: Queue<TrinksProfileSyncJobData, TrinksProfileSyncJobResult> | null = null

export function getTrinksSyncQueue(): Queue<TrinksProfileSyncJobData, TrinksProfileSyncJobResult> {
  if (trinksQueue) return trinksQueue

  const connection = getRedisClient()

  trinksQueue = new Queue<TrinksProfileSyncJobData, TrinksProfileSyncJobResult>(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      // Conservative retry — Trinks rate limits are unknown; better to fail
      // gracefully than to hammer their API.
      attempts: 2,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 86_400, count: 500 },
      removeOnFail: { age: 604_800, count: 1_000 },
    },
  })

  logger.info({ queue: QUEUE_NAME }, "Trinks profile sync queue initialized")
  return trinksQueue
}

/**
 * Enqueues a profile refresh for one customer. Safe to call from the hot path
 * (worker, server action, cron) — never blocks on the Trinks API.
 *
 * jobId is deterministic per customer to dedupe rapid re-enqueues that can
 * happen when multiple messages from the same customer arrive in a burst.
 */
export async function enqueueTrinksProfileSync(
  data: TrinksProfileSyncJobData
): Promise<Job<TrinksProfileSyncJobData, TrinksProfileSyncJobResult> | null> {
  if (!data.salonId || !data.customerId || !data.customerPhone) {
    return null
  }

  try {
    const queue = getTrinksSyncQueue()
    const job = await queue.add("sync-profile", data, {
      jobId: `trinks-profile:${data.customerId}`,
      // Lower priority than message processing — these jobs are background sync.
      priority: 5,
    })
    return job
  } catch (err) {
    logger.warn({ err, customerId: data.customerId }, "Failed to enqueue Trinks profile sync")
    return null
  }
}

/**
 * Cleanup helper for tests / shutdown.
 */
export async function closeTrinksSyncQueue(): Promise<void> {
  if (trinksQueue) {
    await trinksQueue.close()
    trinksQueue = null
  }
}

export { Job as TrinksProfileSyncJob }
