/**
 * Conversões puras entre o MinhaAgenda e a API Belasis. Sem rede, sem banco —
 * é o que os testes mais exercitam, porque é aqui que mora o risco clássico de
 * integração: fuso, formato de telefone e o que conta como "ocupado".
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

import { BRAZIL_TIMEZONE } from '../../../utils/timezone.utils'
import { phoneMatchKey, phonesMatch, toE164Digits } from '../../../utils/phone-match.utils'
import { BelasisApiError } from './belasis-errors'
import type { BelasisFreeTime } from './belasis-types'

/**
 * A API usa data + "HH:MM" sem fuso (hora de parede). Tratamos como horário de
 * Brasília, igual a todo o resto do sistema (parseBrazilianDateTime, lembretes).
 * Salão em outro fuso exigiria fuso por salão — no sistema inteiro, não só aqui.
 */
export const BELASIS_TIME_ZONE = BRAZIL_TIMEZONE

/** Grade presumida quando o free_times tem menos de dois horários para inferir. */
export const BELASIS_DEFAULT_SLOT_MINUTES = 30

const HOUR_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface TimeRange {
  start: Date
  end: Date
}

// ============================================================================
// Hora de parede
// ============================================================================

/** Instantes → o par data + "HH:MM" que a API espera. Início e fim no mesmo dia. */
export function toBelasisWallClock(
  start: Date,
  end: Date,
  timeZone: string = BELASIS_TIME_ZONE
): { date: string; startHour: string; endHour: string } {
  const date = formatInTimeZone(start, timeZone, 'yyyy-MM-dd')
  const endDate = formatInTimeZone(end, timeZone, 'yyyy-MM-dd')
  if (endDate !== date) {
    throw new BelasisApiError(
      'O agendamento atravessa a meia-noite; a Belasis só aceita início e fim no mesmo dia',
      'rejected',
      { method: 'LOCAL', path: 'wall-clock' }
    )
  }
  return {
    date,
    startHour: formatInTimeZone(start, timeZone, 'HH:mm'),
    endHour: formatInTimeZone(end, timeZone, 'HH:mm'),
  }
}

/** Data + "HH:MM" da API → instante. Lança se o formato não for o documentado. */
export function fromBelasisWallClock(
  date: string,
  hour: string,
  timeZone: string = BELASIS_TIME_ZONE
): Date {
  if (!DATE_PATTERN.test(date) || !HOUR_PATTERN.test(hour)) {
    throw new BelasisApiError(`Data/hora fora do formato da Belasis: "${date}" "${hour}"`, 'unavailable', {
      method: 'LOCAL',
      path: 'wall-clock',
    })
  }
  return fromZonedTime(`${date}T${hour}:00`, timeZone)
}

export function nextLocalDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  return next.toISOString().slice(0, 10)
}

/** Datas locais (YYYY-MM-DD) que o intervalo [start, end) toca. */
export function localDatesBetween(start: Date, end: Date, timeZone: string = BELASIS_TIME_ZONE): string[] {
  const dates: string[] = []
  let date = formatInTimeZone(start, timeZone, 'yyyy-MM-dd')
  // Teto defensivo: a disponibilidade pergunta por um dia; nada legítimo passa de 31.
  for (let i = 0; i < 31; i++) {
    dates.push(date)
    date = nextLocalDate(date)
    if (fromZonedTime(`${date}T00:00:00`, timeZone).getTime() >= end.getTime()) break
  }
  return dates
}

// ============================================================================
// O que está ocupado
// ============================================================================

function minutesOf(hour: string): number {
  const [h, m] = hour.split(':').map(Number)
  return h * 60 + m
}

/** O passo da grade: o intervalo mais comum entre horários consecutivos. */
export function inferSlotMinutes(slots: BelasisFreeTime[]): number {
  const minutes = [...new Set(slots.filter((s) => HOUR_PATTERN.test(s.hour)).map((s) => minutesOf(s.hour)))]
    .sort((a, b) => a - b)
  const counts = new Map<number, number>()
  for (let i = 1; i < minutes.length; i++) {
    const gap = minutes[i] - minutes[i - 1]
    counts.set(gap, (counts.get(gap) ?? 0) + 1)
  }
  let best = BELASIS_DEFAULT_SLOT_MINUTES
  let bestCount = 0
  for (const [gap, count] of counts) {
    if (count > bestCount || (count === bestCount && gap < best)) {
      best = gap
      bestCount = count
    }
  }
  return best
}

function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: TimeRange[] = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start.getTime() <= last.end.getTime()) {
      if (range.end.getTime() > last.end.getTime()) last.end = range.end
    } else {
      merged.push({ start: range.start, end: range.end })
    }
  }
  return merged
}

/**
 * A grade de `free_times` de um dia → períodos OCUPADOS.
 *
 * Regra conservadora, porque a Belasis é a agenda oficial: só está livre o que
 * ela marca como `available` (cada horário vale um passo da grade). Todo o resto
 * do dia está ocupado — inclusive o que ela nem lista (fora do expediente, folga).
 * Dia sem nenhum horário = dia inteiro ocupado.
 *
 * `alsoFree`: períodos que contam como livres mesmo marcados como ocupados — o
 * horário atual do agendamento que está sendo remarcado.
 */
export function freeTimesToBusyIntervals(
  slots: BelasisFreeTime[],
  date: string,
  timeZone: string = BELASIS_TIME_ZONE,
  options: { alsoFree?: TimeRange[] } = {}
): TimeRange[] {
  const dayStart = fromZonedTime(`${date}T00:00:00`, timeZone)
  const dayEnd = fromZonedTime(`${nextLocalDate(date)}T00:00:00`, timeZone)
  const stepMs = inferSlotMinutes(slots) * 60_000

  const free = mergeRanges([
    ...slots
      .filter((slot) => slot.label === 'available' && HOUR_PATTERN.test(slot.hour))
      .map((slot) => {
        const start = fromBelasisWallClock(date, slot.hour, timeZone)
        return { start, end: new Date(start.getTime() + stepMs) }
      }),
    ...(options.alsoFree ?? []),
  ])

  const busy: TimeRange[] = []
  let cursor = dayStart
  for (const range of free) {
    if (range.end.getTime() <= cursor.getTime()) continue
    if (range.start.getTime() > cursor.getTime()) {
      busy.push({ start: cursor, end: range.start < dayEnd ? range.start : dayEnd })
    }
    if (range.end.getTime() > cursor.getTime()) cursor = range.end
    if (cursor.getTime() >= dayEnd.getTime()) break
  }
  if (cursor.getTime() < dayEnd.getTime()) busy.push({ start: cursor, end: dayEnd })
  return busy.filter((range) => range.end.getTime() > range.start.getTime())
}

// ============================================================================
// Telefone
// ============================================================================

/**
 * Telefone no formato que a Belasis exige: só dígitos, com DDI e DDD. Null para
 * o que não é telefone (ex.: id interno do WhatsApp) — cadastrar isso na Belasis
 * seria lixo no CRM do salão.
 */
export const toBelasisPhone = toE164Digits

/**
 * A resposta da API traz telefone sem DDI ("11999998888") e o exemplo de
 * paginação da doc vem formatado ("(11) 99999-8888"): comparar sempre por
 * `phonesMatch` (DDD + 8 últimos dígitos).
 */
export { phoneMatchKey, phonesMatch }

// ============================================================================
// Referência nossa no agendamento de lá
// ============================================================================

/**
 * A API não tem chave de idempotência. A referência do agendamento local vai na
 * observação, e é por ela que se acha o agendamento depois de uma escrita sem
 * resposta (timeout após enviar).
 */
export function belasisReferenceMarker(idempotencyKey: string): string {
  return `[MinhaAgenda ${idempotencyKey}]`
}

const REFERENCE_PATTERN = /\[MinhaAgenda ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i

/** O `appointments.id` local gravado na observação, se foi o MinhaAgenda que criou. */
export function parseBelasisReferenceMarker(observation: string | null | undefined): string | null {
  const match = (observation ?? '').match(REFERENCE_PATTERN)
  return match ? match[1].toLowerCase() : null
}

export function belasisObservation(notes: string | undefined, idempotencyKey: string): string {
  const signature = `Agendado pelo MinhaAgenda ${belasisReferenceMarker(idempotencyKey)}`
  const trimmed = notes?.trim()
  return trimmed ? `${trimmed}\n\n${signature}` : signature
}
