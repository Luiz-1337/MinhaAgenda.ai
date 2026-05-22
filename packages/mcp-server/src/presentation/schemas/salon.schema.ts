import { z } from "zod"
import { leadInterestSchema, phoneSchema } from "./common.schema"

/**
 * Schema para buscar informações do salão.
 * Não recebe parâmetros: o salonId vem do closure da tool (contexto do WhatsApp).
 */
export const getSalonInfoSchema = z.object({})

export type GetSalonInfoInput = z.infer<typeof getSalonInfoSchema>

/**
 * Schema para salvar preferência do cliente.
 * O cliente é sempre identificado via clientPhone do closure — a IA não passa customerId.
 */
export const saveCustomerPreferenceSchema = z.object({
  key: z.string().min(1, "Chave é obrigatória").describe("Nome da preferência"),
  value: z
    .union([z.string(), z.number(), z.boolean()])
    .describe("Valor da preferência"),
})

export type SaveCustomerPreferenceInput = z.infer<typeof saveCustomerPreferenceSchema>

/**
 * Schema para qualificar lead
 */
export const qualifyLeadSchema = z.object({
  phoneNumber: phoneSchema.optional().describe(
    "Número do lead (opcional - padrão = telefone do WhatsApp)"
  ),
  interest: leadInterestSchema.describe("Nível de interesse"),
  notes: z.string().optional().describe("Observações sobre o lead"),
})

export type QualifyLeadInput = z.infer<typeof qualifyLeadSchema>
