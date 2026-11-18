import { z } from "zod"

/**
 * Validação de FORMATO das entradas de metas. A regra (mês válido, limite dos
 * valores, o que copiar) fica em `@repo/db` domain/goals.ts.
 */

const goalMonth = z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido")
const target = z.number().min(0, "Meta inválida").max(100_000_000, "Meta alta demais").nullable()

export const goalMonthSchema = goalMonth

export const saveGoalTargetsSchema = z.object({
  salonId: z.string().uuid(),
  month: goalMonth,
  professionalId: z.string().uuid().nullable(),
  targets: z.object({
    revenue: target,
    services: target,
    products: target,
    sales_count: target,
  }),
})

export const copyGoalsSchema = z.object({
  salonId: z.string().uuid(),
  fromMonth: goalMonth,
  toMonth: goalMonth,
})
