import { z } from "zod"

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
})

export type GetProfessionalsInput = z.infer<typeof getProfessionalsSchema>
