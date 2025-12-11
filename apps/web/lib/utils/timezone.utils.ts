import { fromZonedTime, toZonedTime, format as formatTz } from "date-fns-tz"
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, type Locale } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"

// Timezone do Brasil (America/Sao_Paulo = UTC-3)
export const BRAZIL_TIMEZONE = "America/Sao_Paulo"

/**
 * Converte uma data que está no horário de Brasília para UTC
 * Útil quando o usuário seleciona uma data/hora pensando no horário de Brasília
 */
export function toBrazilTime(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  // Trata a data como se estivesse no horário de Brasília e converte para UTC
  return fromZonedTime(dateObj, BRAZIL_TIMEZONE)
}

/**
 * Converte uma data UTC para o horário de Brasília
 */
export function fromBrazilTime(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  return toZonedTime(dateObj, BRAZIL_TIMEZONE)
}

/**
 * Obtém a data atual no horário de Brasília
 */
export function getBrazilNow(): Date {
  return toZonedTime(new Date(), BRAZIL_TIMEZONE)
}

/**
 * Formata uma data no horário de Brasília
 */
export function formatBrazilTime(
  date: Date | string,
  formatStr: string,
  options?: { locale?: Locale }
): string {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  return formatTz(zonedDate, formatStr, {
    timeZone: BRAZIL_TIMEZONE,
    locale: options?.locale || ptBR,
  })
}

/**
 * Obtém o início do dia no horário de Brasília
 */
export function startOfDayBrazil(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const start = startOfDay(zonedDate)
  return fromZonedTime(start, BRAZIL_TIMEZONE)
}

/**
 * Obtém o fim do dia no horário de Brasília
 */
export function endOfDayBrazil(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const end = endOfDay(zonedDate)
  return fromZonedTime(end, BRAZIL_TIMEZONE)
}

/**
 * Obtém o início da semana no horário de Brasília
 */
export function startOfWeekBrazil(date: Date | string, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const start = startOfWeek(zonedDate, options)
  return fromZonedTime(start, BRAZIL_TIMEZONE)
}

/**
 * Obtém o fim da semana no horário de Brasília
 */
export function endOfWeekBrazil(date: Date | string, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const end = endOfWeek(zonedDate, options)
  return fromZonedTime(end, BRAZIL_TIMEZONE)
}

/**
 * Obtém o início do mês no horário de Brasília
 */
export function startOfMonthBrazil(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const start = startOfMonth(zonedDate)
  return fromZonedTime(start, BRAZIL_TIMEZONE)
}

/**
 * Obtém o fim do mês no horário de Brasília
 */
export function endOfMonthBrazil(date: Date | string): Date {
  const dateObj = typeof date === "string" ? new Date(date) : date
  const zonedDate = toZonedTime(dateObj, BRAZIL_TIMEZONE)
  const end = endOfMonth(zonedDate)
  return fromZonedTime(end, BRAZIL_TIMEZONE)
}

