/**
 * Utilitários para manipulação de datas
 */

import {
  TIMEZONE,
  SAO_PAULO_OFFSET,
  ISO_DATETIME_WITH_TZ,
  ISO_DATETIME_WITHOUT_TZ,
  ISO_DATE_ONLY,
} from "../constants"

/**
 * Formata uma data para exibição no formato brasileiro
 */
export function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Formata uma hora para exibição
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * Formata data e hora para exibição
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} às ${formatTime(date)}`
}

/**
 * Converte string para Date
 */
export function parseDate(dateStr: string): Date {
  return new Date(dateStr)
}

/**
 * Verifica se a data é hoje
 */
export function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

/**
 * Verifica se a data é passada
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now()
}

/**
 * Verifica se a data é futura
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now()
}

/**
 * Adiciona minutos a uma data
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

/**
 * Adiciona dias a uma data
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Retorna o início do dia (00:00:00)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/**
 * Retorna o fim do dia (23:59:59.999)
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

/**
 * Calcula a diferença em minutos entre duas datas
 */
export function diffInMinutes(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (60 * 1000))
}

/**
 * Verifica se uma string é um datetime ISO válido
 */
export function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val)
}

/**
 * Verifica se uma string é uma data ou datetime ISO válida
 */
export function isValidIsoDateOrDateTime(val: string): boolean {
  return ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val)
}

/**
 * Verifica se o datetime tem timezone
 */
export function hasTimezone(datetime: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(datetime)
}

/**
 * Garante que uma string de data tenha timezone
 * Se não tiver, adiciona o timezone de São Paulo (-03:00)
 */
export function ensureIsoWithTimezone(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error(`Data inválida: esperava string, recebeu ${typeof input}`)
  }

  const s = input.trim()

  // Já tem timezone completo (Z ou ±HH:mm / ±HHmm)
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s

  // YYYY-MM-DDTHH:mm:ss → adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) {
    return `${s}${SAO_PAULO_OFFSET}`
  }

  // YYYY-MM-DDTHH:mm → adiciona :00-03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    return `${s}:00${SAO_PAULO_OFFSET}`
  }

  // YYYY-MM-DD (só data) → adiciona T09:00:00-03:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T09:00:00${SAO_PAULO_OFFSET}`
  }

  throw new Error(
    `Formato de data não reconhecido: "${s}". Use ISO 8601 (ex: 2025-01-28T14:00:00-03:00)`
  )
}

/**
 * Extrai apenas a data (YYYY-MM-DD) de um datetime
 */
export function extractDateOnly(datetime: string): string {
  return datetime.slice(0, 10)
}

/**
 * Converte uma string de hora (HH:mm) para minutos desde meia-noite
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * Converte minutos desde meia-noite para string de hora (HH:mm)
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

/**
 * Obtém o dia da semana (0-6) de uma data
 */
export function getDayOfWeek(date: Date): number {
  return date.getDay()
}

/**
 * Nome do dia da semana em português
 */
export function getDayOfWeekName(dayOfWeek: number): string {
  const days = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ]
  return days[dayOfWeek] || ""
}
