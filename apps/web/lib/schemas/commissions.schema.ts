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

export const createCommissionAdjustmentSchema = z.object({
  salonId: z.string().uuid(),
  professionalId: z.string().uuid({ message: "Escolha o profissional" }),
  kind: z.enum(["advance", "bonus"]),
  amount: z.number().finite().positive("Informe um valor maior que zero").max(1_000_000, "Valor inválido"),
  referenceDate: calendarDate,
  notes: z.string().max(500, "Observação muito longa").nullish(),
  accountId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
})

export const deleteCommissionAdjustmentSchema = z.object({
  salonId: z.string().uuid(),
  adjustmentId: z.string().uuid(),
})

export const commissionPaymentsFiltersSchema = z.object({
  until: calendarDate.optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
})

export const payCommissionsSchema = z.object({
  salonId: z.string().uuid(),
  cutoffDate: calendarDate,
  paidOn: calendarDate,
  notes: z.string().max(500, "Observação muito longa").nullish(),
  accountId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  professionals: z
    .array(
      z.object({
        professionalId: z.string().uuid(),
        expectedCents: z.number().int().min(0).max(100_000_000_00),
      })
    )
    .min(1, "Escolha ao menos um profissional")
    .max(200, "Pague no máximo 200 profissionais por vez"),
})

export const undoCommissionPaymentSchema = z.object({
  salonId: z.string().uuid(),
  paymentId: z.string().uuid(),
})

export const commissionReceiptsSchema = z
  .object({
    paymentId: z.string().uuid().optional(),
    batchId: z.string().uuid().optional(),
  })
  .refine((value) => !!value.paymentId !== !!value.batchId, "Informe o pagamento ou o lote")

export const recalculateCommissionsSchema = z.object({
  salonId: z.string().uuid(),
  from: calendarDate,
  to: calendarDate,
})
