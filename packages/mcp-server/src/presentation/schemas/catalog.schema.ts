import { z } from "zod"
import { uuidOptionalSchema } from "./common.schema"

/**
 * Schema para buscar serviços
 */
export const getServicesSchema = z.object({
  includeInactive: z
    .boolean()
    .default(false)
    .optional()
    .describe("Incluir serviços inativos"),
})

export type GetServicesInput = z.infer<typeof getServicesSchema>

/**
 * Schema para buscar produtos
 */
export const getProductsSchema = z.object({
  includeInactive: z
    .boolean()
    .default(false)
    .optional()
    .describe("Incluir produtos inativos"),
})

export type GetProductsInput = z.infer<typeof getProductsSchema>

/**
 * Schema para buscar profissionais
 */
export const getProfessionalsSchema = z.object({
  includeInactive: z
    .boolean()
    .default(false)
    .optional()
    .describe("Incluir profissionais inativos"),
  serviceId: uuidOptionalSchema.describe(
    "Opcional. Se informado, retorna só quem REALIZA o serviço, marcando os especialistas (isSpecialist)."
  ),
})

export type GetProfessionalsInput = z.infer<typeof getProfessionalsSchema>
