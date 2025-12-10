/**
 * Serviço de validação e transformação de dados
 */

import { z } from "zod"

/**
 * Valida e normaliza email
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Valida e normaliza string (remove espaços)
 */
export function normalizeString(value: string): string {
  return value.trim()
}

/**
 * Converte string vazia para null
 */
export function emptyStringToNull(value: string | undefined | null): string | null {
  if (!value || value.trim() === "") {
    return null
  }
  return value.trim()
}

/**
 * Formata erro de validação Zod para string legível
 */
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ")
}

/**
 * Valida formato de horário (HH:MM ou HH:MM:SS)
 */
export function isValidTimeFormat(time: string): boolean {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(time)
}

/**
 * Converte horário string para minutos desde meia-noite
 */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * Valida se o horário de início é anterior ao horário de fim
 */
export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  return startMinutes < endMinutes
}

