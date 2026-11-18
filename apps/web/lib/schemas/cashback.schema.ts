import { z } from "zod"

/**
 * Validação de FORMATO das entradas de cashback. A regra (percentual até 100,
 * saldo que não fica negativo, mínimo para resgate) fica em `@repo/db`
 * domain/cashback.ts.
 */

const rateKind = z.enum(["percent", "fixed"])
const money = z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido")

export const saveCashbackSettingsSchema = z.object({
  salonId: z.string().uuid(),
  isEnabled: z.boolean(),
  defaultKind: rateKind,
  defaultValue: money,
  minRedeem: money,
})

export const saveCashbackRuleSchema = z.object({
  salonId: z.string().uuid(),
  itemKind: z.enum(["service", "product"]),
  itemId: z.string().uuid(),
  kind: rateKind,
  value: money,
  isActive: z.boolean(),
})

export const adjustCashbackSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  amount: z
    .number()
    .finite()
    .min(-1_000_000, "Valor inválido")
    .max(1_000_000, "Valor inválido")
    .refine((value) => value !== 0, "Informe o valor do ajuste"),
  reason: z.string().trim().min(1, "Informe o motivo do ajuste").max(200, "Motivo muito longo"),
})

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")

/** O período do relatório "Histórico de cashback". */
export const cashbackHistoryFiltersSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
})
