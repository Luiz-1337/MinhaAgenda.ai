import { z } from "zod"
import {
  ISO_DATETIME_WITH_TZ,
  ISO_DATETIME_WITHOUT_TZ,
  ISO_DATE_ONLY,
} from "../../shared/constants"

/**
 * Verifica se é um datetime ISO válido
 */
export function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val)
}

/**
 * Verifica se é uma data ou datetime ISO válida
 */
export function isValidIsoDateOrDateTime(val: string): boolean {
  return ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val)
}

/**
 * Schema para datetime ISO 8601
 */
export const isoDateTimeSchema = z
  .string()
  .min(1, "Data/hora é obrigatória")
  .refine(isValidIsoDateTime, {
    message:
      "Formato inválido. Use ISO 8601: '2025-01-01T10:00:00' ou '2025-01-01T10:00:00-03:00'",
  })
  .describe("Data/hora ISO 8601 (ex: 2025-01-01T10:00:00-03:00)")

/**
 * Schema para datetime ISO 8601 opcional
 */
export const isoDateTimeOptionalSchema = z
  .string()
  .refine((val) => !val || isValidIsoDateTime(val), {
    message:
      "Formato inválido. Use ISO 8601: '2025-01-01T10:00:00' ou '2025-01-01T10:00:00-03:00'",
  })
  .optional()
  .describe("Data/hora ISO 8601 (ex: 2025-01-01T10:00:00-03:00)")

const NIL_UUID = "00000000-0000-0000-0000-000000000000"

const NIL_UUID_ERROR =
  "ID inválido (placeholder/zerado detectado). Use as tools de busca " +
  "(getServices, getProfessionals, getMyFutureAppointments) para obter " +
  "IDs reais ANTES de criar ou atualizar agendamentos — NUNCA invente IDs."

/**
 * Schema para UUID
 */
export const uuidSchema = z
  .string()
  .uuid("Deve ser um UUID válido")
  .refine((v) => v !== NIL_UUID, { message: NIL_UUID_ERROR })

/**
 * Schema para UUID opcional
 */
export const uuidOptionalSchema = z
  .string()
  .uuid("Deve ser um UUID válido")
  .refine((v) => v !== NIL_UUID, { message: NIL_UUID_ERROR })
  .optional()

/**
 * Schema para telefone brasileiro
 */
export const phoneSchema = z
  .string()
  .min(10, "Telefone deve ter pelo menos 10 dígitos")
  .max(15, "Telefone deve ter no máximo 15 dígitos")
  .describe("Telefone do cliente")

/**
 * Schema para interesse de lead
 */
export const leadInterestSchema = z.enum(["high", "medium", "low", "none"])
