/**
 * Serviço para operações relacionadas à IA
 */

import { openai } from "@ai-sdk/openai"
import { generateText, tool, type CoreMessage } from "ai"
import { z } from "zod"
import type { ChatMessage } from "@/lib/types/chat"

const DEFAULT_MODEL = "gpt-4o"
const DEFAULT_MIN_MODEL = "gpt-4o-mini"

/**
 * Tool para verificar disponibilidade de horários
 */
export function createAvailabilityTool(
  getAvailableSlotsFn: (params: { date: string; salonId: string; serviceDuration: number }) => Promise<string[]>
) {
  return tool({
    description: "Verifica horários disponíveis para um salão em uma data específica.",
    parameters: z.object({
      date: z.string().describe("Data (ISO) do dia solicitado."),
      salonId: z.string().min(1, "salonId é obrigatório"),
    }),
    execute: async ({ date, salonId }) => {
      const slots = await getAvailableSlotsFn({
        date,
        salonId,
        serviceDuration: 60, // Duração padrão de 60 minutos
      })
      return { slots }
    },
  })
}

/**
 * Tool para buscar serviços do salão
 */
export function createGetServicesTool(getServicesFn: () => Promise<{ services: string[] }>) {
  return tool({
    description:
      "Busca e retorna a lista de serviços disponíveis do salão com seus preços. Use esta ferramenta quando o cliente perguntar sobre serviços, preços ou o que o salão oferece.",
    inputSchema: z.object({
      dummy: z.string().optional().describe("Ignorar este campo"),
    }),
    execute: async () => {
      return await getServicesFn()
    },
  })
}

/**
 * Gera resposta de texto usando IA
 */
export async function generateAIResponse(params: {
  systemPrompt: string
  messages: ChatMessage[]
  tools?: Record<string, ReturnType<typeof tool>>
  model?: string
}): Promise<{ text: string; toolResults?: unknown[] }> {
  const { systemPrompt, messages, tools, model = DEFAULT_MODEL } = params

  const coreMessages: CoreMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }))

  const result = await generateText({
    model: openai(model),
    system: systemPrompt,
    messages: coreMessages,
    tools,
  })

  return {
    text: result.text,
    toolResults: result.toolResults,
  }
}

/**
 * Cria system prompt padrão para assistente de salão
 */
export function createSalonAssistantPrompt(salonName: string): string {
  return `Você é o assistente virtual do salão ${salonName}. 

REGRAS CRÍTICAS:
1. Quando você usar uma ferramenta (como getServices), você OBRIGATORIAMENTE deve gerar uma resposta em TEXTO para o usuário baseada no resultado da ferramenta.
2. NUNCA termine uma conversa sem gerar texto. Sempre forneça uma resposta textual ao usuário.
3. Se você usar getServices e receber uma lista de serviços, apresente essa lista de forma clara e amigável ao cliente.
4. Seja educado, conciso e sempre responda em português brasileiro.`
}

