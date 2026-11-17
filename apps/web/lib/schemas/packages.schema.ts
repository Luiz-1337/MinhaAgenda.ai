import { z } from "zod"

/**
 * Validação de FORMATO das entradas de pacotes. A regra (itens do salão, validade,
 * repetição) fica em `@repo/db` domain/packages.ts.
 */

export const savePackageTemplateSchema = z.object({
  salonId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  name: z.string().max(200, "Nome do pacote muito longo"),
  description: z.string().max(1000, "Descrição muito longa").nullish(),
  price: z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido"),
  validityDays: z.number().int("A validade é em dias inteiros").min(1).max(3650).nullable(),
  isActive: z.boolean(),
  items: z
    .array(
      z.object({
        kind: z.enum(["service", "product"]),
        serviceId: z.string().uuid().nullish(),
        productId: z.string().uuid().nullish(),
        quantity: z.number().int("A quantidade é inteira").min(1).max(999),
      })
    )
    .max(30, "O pacote aceita no máximo 30 itens"),
})

export const deletePackageTemplateSchema = z.object({
  salonId: z.string().uuid(),
  templateId: z.string().uuid(),
})
