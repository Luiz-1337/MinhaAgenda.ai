import { z } from "zod"

/**
 * Validação de FORMATO das entradas de compras, fornecedores e marcas/categorias.
 * A regra (total da compra, parcelas, o que dá entrada no estoque, quando se pode
 * excluir) fica em `@repo/db` domain/purchases.ts.
 */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const quantity = z.number().finite().positive("Quantidade inválida").max(1_000_000, "Quantidade inválida")
const money = z.number().finite().min(0, "Valor inválido").max(100_000_000, "Valor inválido")

export const saveSupplierSchema = z.object({
  salonId: z.string().uuid(),
  supplierId: z.string().uuid().nullish(),
  name: z.string().min(1, "Informe o nome do fornecedor").max(120, "Nome muito longo"),
  document: z.string().max(30, "Documento inválido").nullish(),
  phone: z.string().max(30, "Telefone muito longo").nullish(),
  email: z.string().max(160, "E-mail muito longo").nullish(),
  notes: z.string().max(500, "Observação muito longa").nullish(),
})

export const supplierRefSchema = z.object({
  salonId: z.string().uuid(),
  supplierId: z.string().uuid(),
})

export const setSupplierActiveSchema = supplierRefSchema.extend({ isActive: z.boolean() })

const catalogKind = z.enum(["brand", "category"])

export const saveCatalogEntrySchema = z.object({
  salonId: z.string().uuid(),
  kind: catalogKind,
  id: z.string().uuid().nullish(),
  name: z.string().min(1, "Informe o nome").max(60, "Nome muito longo"),
})

export const deleteCatalogEntrySchema = z.object({
  salonId: z.string().uuid(),
  kind: catalogKind,
  id: z.string().uuid(),
})

export const purchasesFiltersSchema = z.object({
  from: calendarDate.optional(),
  to: calendarDate.optional(),
})

export const createPurchaseSchema = z.object({
  salonId: z.string().uuid(),
  supplierId: z.string().uuid().nullish(),
  purchasedOn: calendarDate,
  invoiceNumber: z.string().max(60, "Número da nota muito longo").nullish(),
  notes: z.string().max(500, "Observação muito longa").nullish(),
  freight: money.nullish(),
  discount: money.nullish(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid({ message: "Escolha o produto" }),
        quantity,
        unitCost: money,
      })
    )
    .min(1, "Adicione pelo menos um produto")
    .max(100, "Uma compra aceita no máximo 100 itens"),
  finance: z
    .object({
      paid: z.boolean(),
      firstDueDate: calendarDate.nullish(),
      installments: z.number().int().min(1).max(24).nullish(),
      accountId: z.string().uuid().nullish(),
      categoryId: z.string().uuid().nullish(),
    })
    .nullish(),
})

export const deletePurchaseSchema = z.object({
  salonId: z.string().uuid(),
  purchaseId: z.string().uuid(),
})
