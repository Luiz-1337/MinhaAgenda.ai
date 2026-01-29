import { z } from "zod"
import { uuidSchema, phoneSchema } from "./common.schema"

/**
 * Schema para identificação de cliente
 */
export const identifyCustomerSchema = z.object({
  phone: phoneSchema.optional().describe(
    "Telefone do cliente (opcional - padrão = telefone do WhatsApp)"
  ),
  name: z
    .string()
    .optional()
    .describe("Nome do cliente (usado para criar se não existir)"),
})

export type IdentifyCustomerInput = z.infer<typeof identifyCustomerSchema>

/**
 * Schema para criação de cliente
 */
export const createCustomerSchema = z.object({
  phone: phoneSchema.optional().describe(
    "Telefone do cliente (opcional - padrão = telefone do WhatsApp)"
  ),
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .describe("Nome completo do cliente"),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>

/**
 * Schema para atualização de nome do cliente
 */
export const updateCustomerNameSchema = z.object({
  customerId: uuidSchema.describe("ID do cliente"),
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .describe("Novo nome do cliente"),
})

export type UpdateCustomerNameInput = z.infer<typeof updateCustomerNameSchema>
