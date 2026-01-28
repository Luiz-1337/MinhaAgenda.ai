/**
 * Utilitários centralizados para parsing de datas
 * 
 * Este módulo substitui o parsing manual de datas com regex por funções
 * seguras usando date-fns e date-fns-tz.
 * 
 * Convenção: Todas as datas de entrada são tratadas como horário de Brasília (UTC-3)
 * e convertidas para UTC para armazenamento no banco.
 */

import { parseISO, isValid, getYear, getMonth, getDate, getHours, getMinutes, getSeconds } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { BRAZIL_TIMEZONE } from './timezone.utils'

/**
 * Componentes de uma data/hora no timezone de Brasília
 */
export interface DateComponents {
  year: number
  month: number // 0-indexed (0 = Janeiro, 11 = Dezembro)
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Resultado do parsing de data
 */
export type ParseDateResult = 
  | { success: true; utcDate: Date; brazilComponents: DateComponents }
  | { success: false; error: string }

/**
 * Extrai componentes de data de um objeto Date interpretado como horário de Brasília
 */
function extractBrazilComponents(date: Date): DateComponents {
  // Converte para timezone de Brasília para extrair componentes corretos
  const brazilDate = toZonedTime(date, BRAZIL_TIMEZONE)
  return {
    year: getYear(brazilDate),
    month: getMonth(brazilDate),
    day: getDate(brazilDate),
    hour: getHours(brazilDate),
    minute: getMinutes(brazilDate),
    second: getSeconds(brazilDate),
  }
}

/**
 * Valida os componentes de uma data
 */
function validateComponents(components: DateComponents): string | null {
  const { year, month, day, hour, minute, second } = components

  if (year < 1900 || year > 2100) {
    return `Ano inválido: ${year}`
  }
  if (month < 0 || month > 11) {
    return `Mês inválido: ${month + 1}` // Exibe 1-12 para o usuário
  }
  if (day < 1 || day > 31) {
    return `Dia inválido: ${day}`
  }
  if (hour < 0 || hour > 23) {
    return `Hora inválida: ${hour}`
  }
  if (minute < 0 || minute > 59) {
    return `Minuto inválido: ${minute}`
  }
  if (second < 0 || second > 59) {
    return `Segundo inválido: ${second}`
  }

  return null
}

/**
 * Parse de string de data ISO para UTC, tratando a entrada como horário de Brasília
 * 
 * Aceita formatos:
 * - YYYY-MM-DDTHH:mm
 * - YYYY-MM-DDTHH:mm:ss
 * - YYYY-MM-DDTHH:mm:ss.sss
 * - Qualquer um dos acima com timezone (Z, +HH:mm, -HH:mm)
 * 
 * IMPORTANTE: Se a string NÃO tiver timezone, assume que é horário de Brasília (UTC-3)
 * Se tiver timezone, remove e trata como Brasília (para consistência)
 * 
 * @param dateStr - String de data no formato ISO
 * @returns ParseDateResult com a data em UTC e componentes em Brasília, ou erro
 */
export function parseBrazilianDateTimeString(dateStr: string): ParseDateResult {
  const trimmed = dateStr.trim()
  
  if (!trimmed) {
    return { success: false, error: 'Data não pode ser vazia' }
  }

  // Remove timezone se existir (sempre tratamos como Brasília)
  // Formatos aceitos: Z, +HH:mm, -HH:mm, +HHmm, -HHmm
  const withoutTimezone = trimmed.replace(/Z|[+-]\d{2}:?\d{2}$/, '')
  
  // Tenta fazer parse com date-fns
  let parsedDate = parseISO(withoutTimezone)
  
  // Se parseISO falhou, tenta alguns formatos alternativos
  if (!isValid(parsedDate)) {
    // Tenta adicionar segundos se não tiver (YYYY-MM-DDTHH:mm -> YYYY-MM-DDTHH:mm:00)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(withoutTimezone)) {
      parsedDate = parseISO(`${withoutTimezone}:00`)
    }
  }

  if (!isValid(parsedDate)) {
    return { 
      success: false, 
      error: `Formato de data inválido: ${dateStr}. Esperado formato ISO (ex: 2024-01-15T14:00:00 ou 2024-01-15T14:00)` 
    }
  }

  // Extrai componentes da data parseada (que está "local" sem timezone)
  const components: DateComponents = {
    year: parsedDate.getFullYear(),
    month: parsedDate.getMonth(),
    day: parsedDate.getDate(),
    hour: parsedDate.getHours(),
    minute: parsedDate.getMinutes(),
    second: parsedDate.getSeconds(),
  }

  // Valida componentes
  const validationError = validateComponents(components)
  if (validationError) {
    return { success: false, error: validationError }
  }

  // Converte de "horário de Brasília" para UTC
  // fromZonedTime trata a data como se estivesse no timezone especificado
  const utcDate = fromZonedTime(parsedDate, BRAZIL_TIMEZONE)

  if (!isValid(utcDate)) {
    return { 
      success: false, 
      error: `Não foi possível converter a data para UTC: ${dateStr}` 
    }
  }

  return {
    success: true,
    utcDate,
    brazilComponents: components,
  }
}

/**
 * Parse de objeto Date para UTC, tratando como horário de Brasília
 * 
 * IMPORTANTE: O objeto Date é tratado como se seus componentes (year, month, day, hour, etc.)
 * representassem horário de Brasília, independente do timezone do sistema.
 * 
 * @param date - Objeto Date a ser parseado
 * @returns ParseDateResult com a data em UTC e componentes em Brasília, ou erro
 */
export function parseBrazilianDateTimeObject(date: Date): ParseDateResult {
  if (!isValid(date)) {
    return { success: false, error: 'Data inválida (objeto Date)' }
  }

  // Extrai componentes do Date (assumindo que representa Brasília)
  const components: DateComponents = {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  }

  // Valida componentes
  const validationError = validateComponents(components)
  if (validationError) {
    return { success: false, error: validationError }
  }

  // Converte de "horário de Brasília" para UTC
  const utcDate = fromZonedTime(date, BRAZIL_TIMEZONE)

  if (!isValid(utcDate)) {
    return { success: false, error: 'Não foi possível converter a data para UTC' }
  }

  return {
    success: true,
    utcDate,
    brazilComponents: components,
  }
}

/**
 * Parse unificado de data (string ou Date) para UTC
 * 
 * Esta é a função principal que deve ser usada em appointments.ts
 * 
 * @param input - String ISO ou objeto Date
 * @returns ParseDateResult com a data em UTC e componentes em Brasília, ou erro
 * 
 * @example
 * const result = parseBrazilianDateTime("2024-01-15T14:00:00")
 * if (result.success) {
 *   console.log(result.utcDate) // Date em UTC
 *   console.log(result.brazilComponents.hour) // 14 (hora em Brasília)
 * } else {
 *   console.error(result.error)
 * }
 */
export function parseBrazilianDateTime(input: string | Date): ParseDateResult {
  if (typeof input === 'string') {
    return parseBrazilianDateTimeString(input)
  }
  return parseBrazilianDateTimeObject(input)
}

/**
 * Cria uma data/hora em UTC a partir de componentes no horário de Brasília
 * e uma string de horário (HH:mm)
 * 
 * Útil para criar spans de disponibilidade
 * 
 * @param components - Componentes de data base (year, month, day)
 * @param timeStr - String de horário no formato "HH:mm"
 * @returns Date em UTC ou null se inválido
 */
export function createBrazilDateTimeFromComponents(
  components: Pick<DateComponents, 'year' | 'month' | 'day'>,
  timeStr: string
): Date | null {
  const [hourStr, minuteStr] = timeStr.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  // Cria um Date local com os componentes
  const localDate = new Date(
    components.year,
    components.month,
    components.day,
    hour,
    minute,
    0,
    0
  )

  // Converte de "horário de Brasília" para UTC
  return fromZonedTime(localDate, BRAZIL_TIMEZONE)
}
