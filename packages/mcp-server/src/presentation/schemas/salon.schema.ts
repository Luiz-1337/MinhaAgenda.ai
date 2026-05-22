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

/**
 * Schema para classificar o chat no Kanban.
 *
 * `category` é uma chave SEMÂNTICA estável (não UUID) que o use case resolve
 * para a coluna correta do salão via `chat_kanban_columns.system_key`. Isso
 * sobrevive a renames feitos pelo usuário.
 *
 * O `chatId` vem do closure — a IA nunca passa.
 */
export const setChatKanbanColumnSchema = z.object({
  category: z
    .enum(["pending", "in_progress", "completed", "attention"])
    .describe(
      "Categoria semântica do chat: 'pending' (cliente perguntando), " +
      "'in_progress' (negociando/confirmando agendamento), " +
      "'completed' (cliente finalizou satisfeito), " +
      "'attention' (cliente irritado, cancelando ou com problema)."
    ),
  reason: z
    .string()
    .max(200)
    .describe("Justificativa curta da mudança de coluna (1 frase).")
})

export type SetChatKanbanColumnInput = z.infer<typeof setChatKanbanColumnSchema>
