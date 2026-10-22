/**
 * Fila da sincronização da agenda oficial (Belasis → MinhaAgenda).
 *
 * Disparada pelo botão "Sincronizar agora" (painel) e pelo cron de hora em hora.
 * Um job por salão de cada vez (jobId = "agenda-sync_<salonId>"): clicar várias
 * vezes não empilha sincronizações. O andamento fica no Redis para a tela
 * acompanhar. O trabalho em si roda no worker (Railway), no ritmo lento do
 * provedor — ver syncAgendaForSalon.
 *
 * BullMQ (>=5.x) recusa ":" em jobId, por isso o separador é "_".
 */

import { Queue } from "bullmq"
import { getRedisClient } from "../infra/redis"
import { logger } from "../infra/logger"
import type { AgendaSyncStatus } from "../types/agenda-sync"

export const AGENDA_SYNC_QUEUE = "agenda-sync"

export interface AgendaSyncJobData {
  salonId: string
  trigger: "manual" | "cron"
}

let agendaSyncQueue: Queue<AgendaSyncJobData> | null = null

export function getAgendaSyncQueue(): Queue<AgendaSyncJobData> {
  if (agendaSyncQueue) return agendaSyncQueue
  agendaSyncQueue = new Queue<AgendaSyncJobData>(AGENDA_SYNC_QUEUE, {
    connection: getRedisClient(),
    defaultJobOptions: {
      // Sem nova tentativa automática: o cron de hora em hora já é a nova tentativa.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    },
  })
  logger.info({ queue: AGENDA_SYNC_QUEUE }, "Agenda sync queue initialized")
  return agendaSyncQueue
}

const STATUS_TTL_SECONDS = 7 * 86_400
const statusKey = (salonId: string) => `agenda-sync:status:${salonId}`

export async function readAgendaSyncStatus(salonId: string): Promise<AgendaSyncStatus | null> {
  const raw = await getRedisClient().get(statusKey(salonId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as AgendaSyncStatus
  } catch {
    return null
  }
}

export async function writeAgendaSyncStatus(salonId: string, status: AgendaSyncStatus): Promise<void> {
  await getRedisClient().set(statusKey(salonId), JSON.stringify(status), "EX", STATUS_TTL_SECONDS)
}

/** false = já tem uma sincronização deste salão na fila ou rodando. */
export async function enqueueAgendaSync(data: AgendaSyncJobData): Promise<{ enqueued: boolean }> {
  const queue = getAgendaSyncQueue()
  const jobId = `agenda-sync_${data.salonId}`

  const existing = await queue.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    if (state === "waiting" || state === "active" || state === "delayed" || state === "prioritized") {
      return { enqueued: false }
    }
    // Sobra de uma execução terminada: sem tirar, o add com o mesmo id é ignorado.
    await existing.remove()
  }

  await queue.add("sync", data, { jobId })
  await writeAgendaSyncStatus(data.salonId, {
    state: "queued",
    trigger: data.trigger,
    queuedAt: new Date().toISOString(),
  })
  return { enqueued: true }
}
