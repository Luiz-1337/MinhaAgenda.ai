import { z } from "zod"

/**
 * Validação de FORMATO das entradas do financeiro. A regra de negócio (referências
 * do salão, o que pode baixar, estornar ou excluir) fica em `@repo/db`
 * domain/finance.ts.
 */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const amount = z.number().finite().positive("Informe um valor maior que zero").max(100_000_000)

export const createFinanceTransactionSchema = z.object({
  salonId: z.string().uuid(),
  direction: z.enum(["in", "out"]),
  description: z.string().trim().min(2, "Informe a descrição").max(200, "Descrição muito longa"),
  amount,
  dueDate: calendarDate,
  categoryId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
  counterparty: z.string().max(120).nullish(),
  notes: z.string().max(1000).nullish(),
  paid: z.boolean(),
  paidDate: calendarDate.nullish(),
  installments: z.number().int().min(1).max(60, "No máximo 60 repetições").optional(),
})

export const updateFinanceTransactionSchema = z.object({
  salonId: z.string().uuid(),
  transactionId: z.string().uuid(),
  description: z.string().trim().min(2, "Informe a descrição").max(200, "Descrição muito longa"),
  amount,
  dueDate: calendarDate,
  categoryId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
  counterparty: z.string().max(120).nullish(),
  notes: z.string().max(1000).nullish(),
})

export const createFinanceTransferSchema = z.object({
  salonId: z.string().uuid(),
  fromAccountId: z.string().uuid({ message: "Selecione a conta de origem" }),
  toAccountId: z.string().uuid({ message: "Selecione a conta de destino" }),
  amount,
  date: calendarDate.nullish(),
  notes: z.string().max(1000).nullish(),
})

export const settleFinanceTransactionSchema = z.object({
  salonId: z.string().uuid(),
  transactionId: z.string().uuid(),
  accountId: z.string().uuid().nullish(),
  paidDate: calendarDate.nullish(),
})

export const financeListFiltersSchema = z.object({
  direction: z.enum(["in", "out"]).optional(),
  status: z.enum(["open", "paid"]).optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  accountId: z.string().uuid().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
})

export const saveFinancialAccountSchema = z.object({
  salonId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome").max(60, "Nome muito longo"),
  kind: z.enum(["bank", "cash", "safe", "other"]),
  // Saldo inicial pode ser negativo (conta que entra no sistema devendo).
  openingBalance: z.number().finite().min(-100_000_000).max(100_000_000),
  isActive: z.boolean(),
})

export const saveFinancialCategorySchema = z.object({
  salonId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome").max(60, "Nome muito longo"),
  kind: z.enum(["income", "expense"]),
  isActive: z.boolean(),
})
