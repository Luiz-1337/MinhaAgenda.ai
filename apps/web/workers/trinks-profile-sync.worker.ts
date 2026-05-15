/**
 * Background worker for Trinks customer profile sync.
 *
 * Listens on the trinks-profile-sync BullMQ queue and runs
 * SyncCustomerTrinksProfileUseCase per job. Concurrency is intentionally low
 * (5 by default) to be conservative with the Trinks API's unknown rate limits.
 *
 * Started together with the WhatsApp message worker — same process, same Redis
 * connection. See instrumentation.ts and the worker:start script.
 */

import { Worker } from "bullmq"
import { createRedisClientForBullMQ } from "../lib/infra/redis"
import { logger } from "../lib/infra/logger"
import {
  TrinksProfileSyncJobData,
  TrinksProfileSyncJobResult,
} from "../lib/queues/trinks-sync-queue"
import {
  container,
  registerProviders,
  TOKENS,
} from "@repo/mcp-server"
import type { SyncCustomerTrinksProfileUseCase } from "@repo/mcp-server"

const QUEUE_NAME = "trinks-profile-sync"
const DEFAULT_CONCURRENCY = parseInt(process.env.TRINKS_SYNC_CONCURRENCY ?? "5", 10)

let providersBootstrapped = false
function ensureProvidersRegistered() {
  if (providersBootstrapped) return
  registerProviders(container)
  providersBootstrapped = true
}

export function createTrinksProfileSyncWorker(): Worker<
  TrinksProfileSyncJobData,
  TrinksProfileSyncJobResult
> {
  ensureProvidersRegistered()

  const connection = createRedisClientForBullMQ()

  const worker = new Worker<TrinksProfileSyncJobData, TrinksProfileSyncJobResult>(
    QUEUE_NAME,
    async (job) => {
      const { salonId, customerId, customerPhone } = job.data
      const useCase = container.resolve<SyncCustomerTrinksProfileUseCase>(
        TOKENS.SyncCustomerTrinksProfileUseCase
      )

      const result = await useCase.execute({ salonId, customerId, customerPhone })

      if (!result.success) {
        return {
          status: "error" as const,
          error: result.error.message,
        }
      }

      if (result.data.status === "synced") return { status: "synced" as const }
      if (result.data.status === "not_found") return { status: "not_found" as const }
      return { status: "skipped" as const }
    },
    {
      connection,
      concurrency: DEFAULT_CONCURRENCY,
      // Conservative cap to avoid hammering Trinks during a backlog drain.
      limiter: {
        max: 30,
        duration: 60_000,
      },
    }
  )

  worker.on("completed", (job, result) => {
    logger.debug(
      { jobId: job.id, customerId: job.data.customerId, status: result.status },
      "Trinks profile sync completed"
    )
  })

  worker.on("failed", (job, err) => {
    logger.warn(
      { jobId: job?.id, customerId: job?.data.customerId, err: err.message },
      "Trinks profile sync failed"
    )
  })

  worker.on("error", (err) => {
    logger.error({ err }, "Trinks profile sync worker error")
  })

  logger.info(
    { queue: QUEUE_NAME, concurrency: DEFAULT_CONCURRENCY },
    "Trinks profile sync worker started"
  )

  return worker
}
