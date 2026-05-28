import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import {
  GetSalonDetailsUseCase,
  SaveCustomerPreferenceUseCase,
  QualifyLeadUseCase,
  SetChatKanbanColumnUseCase,
} from "../../application/use-cases/salon"
import {
  getSalonInfoSchema,
  saveCustomerPreferenceSchema,
  qualifyLeadSchema,
  setChatKanbanColumnSchema,
} from "../schemas"
import { defineTool } from "./defineTool"
import { resolveCustomerId } from "./tool-helpers"
import type { ToolContext, ToolSet } from "./types"

/**
 * Cria as tools do salão.
 *
 * salonId, clientPhone e chatId vêm do contexto (resolvido pelo webhook do WhatsApp).
 * As tools NUNCA devem aceitar esses IDs como input — caso contrário, a IA tende
 * a alucinar valores (ex: UUID nulo "00000000-0000-0000-0000-000000000000").
 *
 * `chatId` é opcional: quando ausente, tools que precisam dele (setChatKanbanColumn)
 * retornam erro amigável que a IA pode ignorar.
 */
export function createSalonTools(ctx: ToolContext): ToolSet {
  return {
    getSalonInfo: defineTool(ctx, {
      description:
        "Retorna informações do salão: nome, endereço, horários de funcionamento, política de cancelamento.",
      inputSchema: getSalonInfoSchema,
      handler: async (_input, { container, salonId }) => {
        const result = await container
          .resolve<GetSalonDetailsUseCase>(TOKENS.GetSalonDetailsUseCase)
          .execute(salonId)

        const data = unwrap(result)
        return {
          name: data.name,
          address: data.address,
          phone: data.phone,
          description: data.description,
          cancellationPolicy: data.cancellationPolicy,
          businessHours: data.businessHours,
          message: data.message,
        }
      },
    }),

    saveCustomerPreference: defineTool(ctx, {
      description: "Salva uma preferência do cliente no CRM.",
      inputSchema: saveCustomerPreferenceSchema,
      handler: async (input, { container, salonId }) => {
        const customerId = await resolveCustomerId(ctx)

        const result = await container
          .resolve<SaveCustomerPreferenceUseCase>(TOKENS.SaveCustomerPreferenceUseCase)
          .execute({
            salonId,
            customerId,
            key: input.key,
            value: input.value,
          })

        const data = unwrap(result)
        return {
          customerId: data.customerId,
          key: data.key,
          value: data.value,
          message: data.message,
        }
      },
    }),

    qualifyLead: defineTool(ctx, {
      description:
        "Qualifica um lead baseado no nível de interesse demonstrado.",
      inputSchema: qualifyLeadSchema,
      handler: async (input, { container, salonId, clientPhone }) => {
        const result = await container
          .resolve<QualifyLeadUseCase>(TOKENS.QualifyLeadUseCase)
          .execute({
            salonId,
            phoneNumber: input.phoneNumber || clientPhone,
            interest: input.interest,
            notes: input.notes,
          })

        const data = unwrap(result)
        return {
          leadId: data.leadId,
          status: data.status,
          message: data.message,
        }
      },
    }),

    setChatKanbanColumn: defineTool(ctx, {
      description:
        "Move este chat para uma coluna do Kanban. USE APENAS quando o estado da conversa MUDAR claramente: " +
        "1) 'in_progress' quando o cliente confirma agendamento ou está em negociação ativa; " +
        "2) 'completed' quando o cliente agradece, finaliza ou sai satisfeito; " +
        "3) 'attention' quando o cliente está irritado, reclamando, cancelando ou com problema urgente; " +
        "4) 'pending' quando volta a ser apenas uma pergunta inicial sem ação. " +
        "Não chame se a categoria não mudou — evite mover o chat repetidamente.",
      inputSchema: setChatKanbanColumnSchema,
      handler: async (input, { container, salonId, chatId }) => {
        if (!chatId) {
          throw new Error("chatId não disponível neste contexto")
        }

        const result = await container
          .resolve<SetChatKanbanColumnUseCase>(TOKENS.SetChatKanbanColumnUseCase)
          .execute({
            salonId,
            chatId,
            category: input.category,
            reason: input.reason,
          })

        const data = unwrap(result)
        return {
          columnId: data.columnId,
          columnName: data.columnName,
          changed: data.changed,
          message: data.message,
        }
      },
    }),
  }
}
