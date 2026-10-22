import type { AgendaImportSummary } from "@repo/db"

/**
 * Andamento da sincronização da agenda oficial (Belasis → MinhaAgenda) de um
 * salão. Fica no Redis enquanto roda e depois com o resultado da última vez.
 */
export interface AgendaSyncStatus {
  state: "queued" | "running" | "done" | "failed"
  trigger: "manual" | "cron"
  queuedAt?: string
  startedAt?: string
  finishedAt?: string
  progress?: { done: number; total: number }
  summary?: AgendaImportSummary
  error?: string
}
