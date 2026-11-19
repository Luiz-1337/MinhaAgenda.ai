/**
 * Recorrência de agendamento — regra pura, sem I/O (docs/ROADMAP.md, fase 7,
 * fatia 7c).
 *
 * O mesmo atendimento repetido a cada N semanas, no mesmo dia da semana e na
 * mesma hora. A série não é uma regra que gera horários no futuro: ao criar, cada
 * data vira um agendamento comum, que passa pelas conferências de sempre.
 *
 * As datas aqui são "relógio de parede" de Brasília ("YYYY-MM-DDTHH:mm"), como o
 * formulário de agendamento manda. O Brasil não tem horário de verão, então somar
 * dias ao calendário mantém a hora.
 */
import { isCalendarDate } from './finance'

export const APPOINTMENT_SERIES_LIMITS = {
  intervalWeeks: { min: 1, max: 8 },
  /** Contando o primeiro. Cada um é criado e conferido na hora: mais do que isso demora. */
  occurrences: { min: 2, max: 12 },
} as const

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/

/** "2026-11-20" + 7 dias → "2026-11-27". Vira mês e ano certo. */
export function addCalendarDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, date + days))
  return [
    String(next.getUTCFullYear()).padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export type AppointmentSeriesDraft = {
  /** A primeira data e hora, "YYYY-MM-DDTHH:mm" (Brasília). */
  start: unknown
  intervalWeeks: unknown
  occurrences: unknown
}

export type AppointmentSeriesPlan =
  | { ok: true; intervalWeeks: number; occurrences: number; dates: string[] }
  | { ok: false; error: string }

/** As datas da série: a primeira e as repetições, a cada N semanas. */
export function planAppointmentSeries(draft: AppointmentSeriesDraft): AppointmentSeriesPlan {
  const match = typeof draft.start === 'string' ? LOCAL_DATE_TIME.exec(draft.start) : null
  if (!match || !isCalendarDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59) {
    return { ok: false, error: 'Data e hora inválidas' }
  }
  const [, day, hour, minute] = match

  const { intervalWeeks: weeks, occurrences: times } = APPOINTMENT_SERIES_LIMITS

  const intervalWeeks = typeof draft.intervalWeeks === 'number' ? draft.intervalWeeks : Number.NaN
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < weeks.min || intervalWeeks > weeks.max) {
    return { ok: false, error: `A repetição é a cada ${weeks.min} a ${weeks.max} semanas` }
  }

  const occurrences = typeof draft.occurrences === 'number' ? draft.occurrences : Number.NaN
  if (!Number.isInteger(occurrences) || occurrences < times.min || occurrences > times.max) {
    return { ok: false, error: `A repetição é de ${times.min} a ${times.max} vezes, contando a primeira` }
  }

  const dates = Array.from(
    { length: occurrences },
    (_, index) => `${addCalendarDays(day, index * intervalWeeks * 7)}T${hour}:${minute}`
  )

  return { ok: true, intervalWeeks, occurrences, dates }
}

/** "20/11/2026" de "2026-11-20T15:00". */
export function seriesDateLabel(dateTime: string): string {
  const [year, month, date] = dateTime.slice(0, 10).split('-')
  return `${date}/${month}/${year}`
}

/**
 * O resumo de uma série recém-criada, para quem está no balcão: quantos entraram
 * e quais datas não couberam, com o motivo de cada uma.
 */
export function describeSeriesOutcome(input: {
  created: readonly { date: string }[]
  failed: readonly { date: string; error: string }[]
}): string {
  const made = input.created.length
  const base = `${made} ${made === 1 ? 'agendamento criado' : 'agendamentos criados'}`
  if (input.failed.length === 0) return base

  const misses = input.failed.map((miss) => `${seriesDateLabel(miss.date)} (${miss.error})`).join('; ')
  return `${base}. Não ${input.failed.length === 1 ? 'coube' : 'couberam'}: ${misses}`
}
