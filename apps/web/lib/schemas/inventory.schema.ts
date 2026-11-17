import { z } from "zod"

/**
 * Validação de FORMATO das entradas de estoque. A regra (o sinal do movimento, o
 * acerto como diferença, o que é "abaixo do mínimo") fica em `@repo/db`
 * domain/inventory.ts.
 */

const quantity = z.number().finite().min(0, "Quantidade inválida").max(1_000_000, "Quantidade inválida")
const money = z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido")

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
const batchCode = z.string().max(60, "Código do lote muito longo")

export const inventoryFiltersSchema = z.object({
  productId: z.string().uuid().optional(),
})

export const createStockMovementSchema = z.object({
  salonId: z.string().uuid(),
  productId: z.string().uuid({ message: "Escolha o produto" }),
  kind: z.enum(["in", "out", "adjustment"]),
  quantity,
  unitCost: money.nullish(),
  notes: z.string().max(500, "Observação muito longa").nullish(),
  batchCode: batchCode.nullish(),
  manufacturedOn: calendarDate.nullish(),
  expiresOn: calendarDate.nullish(),
})

export const saveBatchSchema = z.object({
  salonId: z.string().uuid(),
  batchId: z.string().uuid().nullish(),
  productId: z.string().uuid().nullish(),
  code: batchCode.nullish(),
  manufacturedOn: calendarDate.nullish(),
  expiresOn: calendarDate.nullish(),
  quantity: z.number().finite().positive("Quantidade inválida").max(1_000_000, "Quantidade inválida"),
  notes: z.string().max(500, "Observação muito longa").nullish(),
})

export const deleteBatchSchema = z.object({
  salonId: z.string().uuid(),
  batchId: z.string().uuid(),
})

export const saveProductStockSettingsSchema = z.object({
  salonId: z.string().uuid(),
  productId: z.string().uuid(),
  trackStock: z.boolean(),
  minStock: quantity,
  costPrice: money.nullish(),
  sku: z.string().max(60, "Código muito longo").nullish(),
  barcode: z.string().max(60, "Código de barras muito longo").nullish(),
  brandId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  contentAmount: z.number().finite().positive("Quantidade inválida").max(1_000_000, "Quantidade inválida").nullish(),
  contentUnit: z.enum(["ml", "g", "un"]).nullish(),
})

export const saveServiceConsumptionSchema = z.object({
  salonId: z.string().uuid(),
  serviceId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid({ message: "Escolha o produto" }),
        quantity: z.number().finite().positive("Quantidade inválida").max(1_000_000, "Quantidade inválida"),
      })
    )
    .max(30, "Um serviço aceita no máximo 30 produtos"),
})
