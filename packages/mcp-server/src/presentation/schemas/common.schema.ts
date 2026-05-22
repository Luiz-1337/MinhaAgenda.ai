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

/**
 * UUID "nulo" (todos zeros). A IA tende a alucinar esse valor quando
 * um schema declara um campo UUID opcional cujo valor real ela não conhece.
 */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000"

/**
 * Schema para UUID
 */
export const uuidSchema = z
  .string()
  .uuid("Deve ser um UUID válido")
  .refine((v) => v !== NIL_UUID, "UUID nulo (todos zeros) não é permitido")

/**
 * Schema para UUID opcional
 */
export const uuidOptionalSchema = z
  .string()
  .uuid("Deve ser um UUID válido")
  .refine((v) => v !== NIL_UUID, "UUID nulo (todos zeros) não é permitido")
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
