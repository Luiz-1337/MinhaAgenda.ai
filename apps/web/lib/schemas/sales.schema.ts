import { z } from "zod"

/**
 * Validação de FORMATO das entradas de comanda. A regra de negócio (referências do
 * salão, totais, o que pode faturar) fica em `@repo/db` domain/sales.ts — aqui só
 * se garante que o que chega do cliente tem a forma esperada.
 */

const money = z.number().finite().min(0).max(1_000_000)

export const saleItemSchema = z.object({
  kind: z.enum(["service", "product", "package", "subscription"]),
  serviceId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  packageTemplateId: z.string().uuid().nullish(),
  professionalId: z.string().uuid().nullish(),
  assistantId: z.string().uuid().nullish(),
  quantity: z.number().finite().positive().max(9999),
  unitPrice: money.nullable(),
  discountAmount: money,
  appointmentId: z.string().uuid().nullish(),
  customerPackageItemId: z.string().uuid().nullish(),
  customerSubscriptionId: z.string().uuid().nullish(),
})

export const saveSaleSchema = z.object({
  salonId: z.string().uuid(),
  saleId: z.string().uuid().optional(),
  customerId: z.string().uuid({ message: "Selecione o cliente" }),
  saleDate: z.coerce.date({ message: "Data inválida" }),
  notes: z.string().max(2000, "Observações muito longas").nullish(),
  items: z.array(saleItemSchema).max(100, "A comanda aceita no máximo 100 itens"),
})

export const invoiceSaleSchema = z.object({
  salonId: z.string().uuid(),
  saleId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        paymentMethodId: z.string().uuid({ message: "Selecione a forma de pagamento" }),
        amount: z.number().finite().positive("Informe o valor do pagamento").max(100_000_000),
      })
    )
    .max(20, "No máximo 20 pagamentos por comanda"),
  acceptDebt: z.boolean().optional(),
  debtDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida")
    .nullish(),
})

export const receiveSalePaymentSchema = z.object({
  salonId: z.string().uuid(),
  saleId: z.string().uuid(),
  payments: z
    .array(
      z.object({
        paymentMethodId: z.string().uuid({ message: "Selecione a forma de pagamento" }),
        amount: z.number().finite().positive("Informe o valor do pagamento").max(100_000_000),
      })
    )
    .min(1, "Informe ao menos um pagamento")
    .max(20, "No máximo 20 pagamentos por vez"),
})

export const saleListFiltersSchema = z.object({
  status: z.enum(["open", "invoiced", "void"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  debt: z.boolean().optional(),
  page: z.number().int().min(1).max(10_000).optional(),
})

export const savePaymentMethodSchema = z.object({
  salonId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome").max(60, "Nome muito longo"),
  kind: z.enum(["cash", "pix", "credit_card", "debit_card", "other"]),
  feePercent: z.number().finite().min(0, "Taxa inválida").max(100, "Taxa inválida"),
  settlementDays: z.number().int("Prazo inválido").min(0, "Prazo inválido").max(365, "Prazo inválido"),
  isActive: z.boolean(),
  accountId: z.string().uuid().nullish(),
})
