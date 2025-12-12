/**
 * Utilitários para manipulação de tempo e horários
 */

export const MINUTE_IN_MS = 60 * 1000

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
