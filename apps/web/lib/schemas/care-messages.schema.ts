import { z } from "zod"

/**
 * Validação de FORMATO das entradas das mensagens de cuidados e de retorno. A
 * regra (tipo × item, limite de dias, tamanho do texto) fica em `@repo/db`
 * domain/care-messages.ts.
 */

export const saveCareMessageRuleSchema = z.object({
  salonId: z.string().uuid(),
  ruleId: z.string().uuid().nullish(),
  kind: z.enum(["pre_care", "post_care", "return"]),
  serviceId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  offsetDays: z.number().int().min(0).max(365),
  message: z.string().max(2000, "Mensagem muito longa"),
  isActive: z.boolean(),
})

export const careMessageRuleRefSchema = z.object({
  salonId: z.string().uuid(),
  ruleId: z.string().uuid(),
})

export const careMessageDispatchRefSchema = z.object({
  salonId: z.string().uuid(),
  dispatchId: z.string().uuid(),
})
