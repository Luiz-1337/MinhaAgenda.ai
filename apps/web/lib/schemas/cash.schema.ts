import { z } from "zod"

/**
 * Validação de FORMATO das entradas do caixa. A regra (sangria maior que o
 * dinheiro em caixa, diferença do fechamento) fica em `@repo/db` domain/cash.ts.
 */

export const openCashSchema = z.object({
  salonId: z.string().uuid(),
  openingAmount: z.number().finite().min(0, "Informe o saldo inicial").max(100_000_000),
  notes: z.string().max(500).nullish(),
})

export const cashMovementSchema = z.object({
  salonId: z.string().uuid(),
  kind: z.enum(["supply", "withdrawal"]),
  amount: z.number().finite().positive("Informe um valor maior que zero").max(100_000_000),
  description: z.string().max(200).nullish(),
})

export const closeCashSchema = z.object({
  salonId: z.string().uuid(),
  countedAmount: z.number().finite().min(0, "Informe o valor contado").max(100_000_000),
  notes: z.string().max(500).nullish(),
})
