import { z } from "zod"

/**
 * Validação de FORMATO das entradas de comissão. A regra (qual comissão vale para
 * o item, como a taxa e o desconto entram na conta) fica em `@repo/db`
 * domain/commissions.ts.
 */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const shareMode = z.enum(["proportional", "salon", "professional", "split"])

export const commissionStatementFiltersSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  professionalId: z.string().uuid().optional(),
})

export const saveCommissionSettingsSchema = z.object({
  salonId: z.string().uuid(),
  professionalId: z.string().uuid().nullable(),
  dateBasis: z.enum(["competence", "availability"]).nullable(),
  feeMode: shareMode.nullable(),
  discountMode: shareMode.nullable(),
})

export const saveCommissionRulesSchema = z.object({
  salonId: z.string().uuid(),
  professionalId: z.string().uuid().nullable(),
  rules: z
    .array(
      z.object({
        serviceId: z.string().uuid().nullish(),
        productId: z.string().uuid().nullish(),
        kind: z.enum(["percent", "fixed"]),
        value: z.number().finite().min(0, "Comissão inválida").max(1_000_000, "Comissão inválida"),
      })
    )
    .max(1000, "No máximo 1000 regras por vez"),
})

export const saveCommissionAssistantRulesSchema = z.object({
  salonId: z.string().uuid(),
  professionalId: z.string().uuid().nullable(),
  rules: z
    .array(
      z.object({
        serviceId: z.string().uuid(),
        kind: z.enum(["percent", "fixed"]),
        value: z.number().finite().min(0, "Comissão inválida").max(1_000_000, "Comissão inválida"),
        base: z.enum(["gross", "commission"]),
        deductFrom: z.enum(["salon", "professional"]),
      })
    )
    .max(1000, "No máximo 1000 regras por vez"),
})

export const recalculateCommissionsSchema = z.object({
  salonId: z.string().uuid(),
  from: calendarDate,
  to: calendarDate,
})
