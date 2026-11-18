import { z } from "zod"

/**
 * Validação de FORMATO das entradas de promoções. A regra (formato do cupom,
 * percentual até 100, vigência coerente) fica em `@repo/db` domain/promotions.ts.
 */

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")

export const savePromotionSchema = z.object({
  salonId: z.string().uuid(),
  promotionId: z.string().uuid().optional(),
  name: z.string().max(200, "Nome da promoção muito longo"),
  code: z.string().max(60, "Cupom muito longo"),
  discountKind: z.enum(["percent", "fixed"]),
  discountValue: z.number().finite().min(0, "Valor inválido").max(1_000_000, "Valor inválido"),
  appliesTo: z.enum(["all", "services", "products"]),
  startsOn: calendarDate.nullable(),
  endsOn: calendarDate.nullable(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  isActive: z.boolean(),
})

export const promotionRefSchema = z.object({
  salonId: z.string().uuid(),
  promotionId: z.string().uuid(),
})
