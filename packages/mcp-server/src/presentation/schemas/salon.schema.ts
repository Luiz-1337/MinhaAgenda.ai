import { z } from "zod"
import { uuidSchema, uuidOptionalSchema, leadInterestSchema, phoneSchema } from "./common.schema"

/**
 * Schema para buscar informações do salão
 */
export const getSalonInfoSchema = z.object({
  salonId: uuidOptionalSchema.describe("ID do salão (opcional)"),
})

export type GetSalonInfoInput = z.infer<typeof getSalonInfoSchema>

/**
 * Schema para salvar preferência do cliente
 */
export const saveCustomerPreferenceSchema = z.object({
  customerId: uuidOptionalSchema.describe(
    "ID do cliente (opcional - padrão = cliente do WhatsApp)"
  ),
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
