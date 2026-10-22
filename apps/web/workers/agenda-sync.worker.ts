/**
 * Worker da sincronização da agenda oficial (Belasis → MinhaAgenda).
 *
 * Roda no mesmo processo do worker de mensagens (Railway). Concorrência baixa:
 * cada sincronização já anda no ritmo lento do provedor (15 chamadas/min por
 * chave), e a cota é dividida com a IA ao vivo. Escreve o andamento no Redis
 * para a tela de Integrações acompanhar.
 *
 * Grafo do worker (tsx): só import relativo ou de pacote, nunca "@/".
 */

import { Worker } from "bullmq"
import { domainServices } from "@repo/db"
import { createRedisClientForBullMQ } from "../lib/infra/redis"
import { logger } from "../lib/infra/logger"
import {
  AGENDA_SYNC_QUEUE,
  writeAgendaSyncStatus,
  type AgendaSyncJobData,
} from "../lib/queues/agenda-sync-queue"

const PROGRESS_WRITE_INTERVAL_MS = 2_000

export function createAgendaSyncWorker(): Worker<AgendaSyncJobData> {
  const worker = new Worker<AgendaSyncJobData>(
    AGENDA_SYNC_QUEUE,
    async (job) => {
      const { salonId, trigger } = job.data
      const startedAt = new Date().toISOString()

      // Escritas em série: uma escrita de andamento atrasada não pode passar por
      // cima do resultado final.
      let writes: Promise<void> = writeAgendaSyncStatus(salonId, {
        state: "running",
        trigger,
        startedAt,
        progress: { done: 0, total: 0 },
      })
      let lastWrite = 0

      const result = await domainServices.syncAgendaForSalon(salonId, {
        onProgress: (done, total) => {
          const now = Date.now()
          if (now - lastWrite < PROGRESS_WRITE_INTERVAL_MS && done < total) return
          lastWrite = now
          writes = writes
            .then(() =>
              writeAgendaSyncStatus(salonId, { state: "running", trigger, startedAt, progress: { done, total } })
            )
            .catch(() => undefined)
        },
      })

      await writes.catch(() => undefined)
      const finishedAt = new Date().toISOString()
      if (result.ok) {
        await writeAgendaSyncStatus(salonId, { state: "done", trigger, startedAt, finishedAt, summary: result.data })
        logger.info({ salonId, trigger, summary: result.data }, "Agenda sync finished")
      } else {
        await writeAgendaSyncStatus(salonId, { state: "failed", trigger, startedAt, finishedAt, error: result.error })
        logger.warn({ salonId, trigger, error: result.error }, "Agenda sync failed")
      }
    },
    { connection: createRedisClientForBullMQ(), concurrency: 2 }
  )

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, salonId: job?.data.salonId, err: err.message }, "Agenda sync job crashed")
    if (job) {
      void writeAgendaSyncStatus(job.data.salonId, {
        state: "failed",
        trigger: job.data.trigger,
        finishedAt: new Date().toISOString(),
        error: "A sincronização falhou inesperadamente. Tente de novo em instantes.",
      }).catch(() => undefined)
    }
  })

  worker.on("error", (err) => {
    logger.error({ err }, "Agenda sync worker error")
  })

  logger.info({ queue: AGENDA_SYNC_QUEUE }, "Agenda sync worker started")
  return worker
}
