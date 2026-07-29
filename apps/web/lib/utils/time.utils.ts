/**
 * Utilitários para manipulação de tempo e horários
 */

import { BRAZIL_TIMEZONE } from "@repo/db"

export const MINUTE_IN_MS = 60 * 1000
const HOUR_IN_MS = 60 * MINUTE_IN_MS
const DAY_IN_MS = 24 * HOUR_IN_MS

/** Ano de uma data no fuso de Brasília (para decidir se o rótulo mostra o ano). */
function brazilYear(date: Date): string {
  return date.toLocaleDateString("pt-BR", { year: "numeric", timeZone: BRAZIL_TIMEZONE })
}

/**
 * Rótulo curto da última mensagem, para listas de conversa (chat e kanban).
 *
 * Recente vira tempo relativo; a partir de 7 dias vira DATA — nunca hora.
 * Mostrar `19:35` numa conversa de três semanas atrás a torna indistinguível de
 * uma de hoje às 19:35, que era o bug de `getChatConversations` (a cópia do
 * kanban já estava certa; as duas divergiram justamente por serem duplicadas).
 *
 * `now` é injetável para o teste não precisar mockar o relógio.
 */
export function formatPreviewTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / MINUTE_IN_MS)
  const diffHours = Math.floor(diffMs / HOUR_IN_MS)
  const diffDays = Math.floor(diffMs / DAY_IN_MS)

  // Math.max protege contra data no futuro (relógio do cliente adiantado, ou
  // timestamp da Meta à frente do nosso) — "-3m" na lista fica bizarro.
  if (diffMins < 60) return `${Math.max(diffMins, 0)}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays}d`

  // Fuso explícito: sem ele o servidor (UTC na Vercel) erra o dia em qualquer
  // mensagem enviada depois das 21h de Brasília.
  const sameYear = brazilYear(date) === brazilYear(now)
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: BRAZIL_TIMEZONE,
  })
}

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

export type DayKey = (typeof DAY_KEYS)[number]

/**
 * Converte string de horário para Date no contexto de um dia específico
 * Retorna null se o formato for inválido
 */
export function parseTimeInDay(base: Date, time: string): Date | null {
  const [hourStr, minuteStr] = time.split(":")
  const hours = Number(hourStr)
  const minutes = Number(minuteStr)

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const result = new Date(base)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * Obtém a chave do dia da semana a partir de uma data
 */
export function getDayKey(date: Date): DayKey {
  return DAY_KEYS[date.getDay()]
}

