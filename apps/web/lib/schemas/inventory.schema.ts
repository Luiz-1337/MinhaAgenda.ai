import { z } from "zod"

/**
 * Validação de FORMATO das entradas de estoque. A regra (o sinal do movimento, o
 * acerto como diferença, o que é "abaixo do mínimo") fica em `@repo/db`
 * domain/inventory.ts.
 */

const quantity = z.number().finite().min(0, "Quantidade inválida").max(1_000_000, "Quantidade inválida")
const money = z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido")

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
})

export const saveProductStockSettingsSchema = z.object({
  salonId: z.string().uuid(),
  productId: z.string().uuid(),
  trackStock: z.boolean(),
  minStock: quantity,
  costPrice: money.nullish(),
  sku: z.string().max(60, "Código muito longo").nullish(),
  barcode: z.string().max(60, "Código de barras muito longo").nullish(),
})
