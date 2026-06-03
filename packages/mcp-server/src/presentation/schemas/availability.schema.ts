import { z } from "zod"
import { isoDateTimeSchema, uuidSchema, uuidOptionalSchema } from "./common.schema"

/**
 * Schema para verificação de disponibilidade
 */
export const checkAvailabilitySchema = z.object({
  professionalId: uuidOptionalSchema.describe(
    "ID do profissional. OPCIONAL: omita quando o cliente não tiver preferência — o sistema retorna os horários de quem faz o serviço, com os especialistas primeiro."
  ),
  date: isoDateTimeSchema.describe("Data para verificar disponibilidade"),
  serviceId: uuidOptionalSchema.describe(
    "ID do serviço. Fortemente recomendado quando não há professionalId: define a duração e restringe aos profissionais que realizam o serviço."
  ),
  serviceDuration: z
    .number()
    .int()
    .positive("Duração deve ser positiva")
    .optional()
    .describe("Duração do serviço em minutos (padrão: 60)"),
})

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>

/**
 * Schema para buscar regras de disponibilidade de profissional
 */
export const getProfessionalAvailabilityRulesSchema = z.object({
  professionalName: z
    .string()
    .min(1, "Nome do profissional é obrigatório")
    .describe("Nome do profissional"),
})

export type GetProfessionalAvailabilityRulesInput = z.infer<
  typeof getProfessionalAvailabilityRulesSchema
>
