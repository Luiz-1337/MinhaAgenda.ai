/**
 * Serviço para operações relacionadas à IA
 * Este arquivo re-exporta todos os serviços de IA organizados por responsabilidade
 */

// ============================================================================
// DOMAIN LAYER - Regras de Negócio Puras
// ============================================================================

export { FuzzySearchService } from "./ai/fuzzy-search.service"
export { ModelMapper, mapModelToOpenAI } from "./ai/model-mapper.service"

// ============================================================================
// APPLICATION LAYER - Casos de Uso
// ============================================================================

export { AgentInfoService, getActiveAgentInfo } from "./ai/agent-info.service"
export { SystemPromptBuilder, createSalonAssistantPrompt } from "./ai/system-prompt-builder.service"

// Tools Factories
export { AvailabilityToolFactory } from "./ai/tools/availability-tool-factory.service"
export { AppointmentToolFactory } from "./ai/tools/appointment-tool-factory.service"
export { ServicesToolFactory } from "./ai/tools/services-tool-factory.service"
export { ProductsToolFactory } from "./ai/tools/products-tool-factory.service"
export { ProfessionalsToolFactory } from "./ai/tools/professionals-tool-factory.service"
export { PreferencesToolFactory } from "./ai/tools/preferences-tool-factory.service"

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

import { AvailabilityToolFactory } from "./ai/tools/availability-tool-factory.service"
import { AppointmentToolFactory } from "./ai/tools/appointment-tool-factory.service"
import { ServicesToolFactory } from "./ai/tools/services-tool-factory.service"
import { ProductsToolFactory } from "./ai/tools/products-tool-factory.service"
import { ProfessionalsToolFactory } from "./ai/tools/professionals-tool-factory.service"
import { PreferencesToolFactory } from "./ai/tools/preferences-tool-factory.service"
import { mapModelToOpenAI } from "./ai/model-mapper.service"
import { getActiveAgentInfo } from "./ai/agent-info.service"
import { createSalonAssistantPrompt } from "./ai/system-prompt-builder.service"

/**
 * Tool para verificar disponibilidade de horários
 * @deprecated Use AvailabilityToolFactory.create() instead
 */
export function createAvailabilityTool(
  salonId: string,
  getAvailableSlotsFn: (params: {
    date: string
    salonId: string
    serviceDuration: number
    professionalId: string
  }) => Promise<string[]>
) {
  return AvailabilityToolFactory.create(salonId, getAvailableSlotsFn)
}

/**
 * Tool para agendar horário
 * @deprecated Use AppointmentToolFactory.create() instead
 */
export function createBookAppointmentTool(salonId: string, clientId?: string) {
  return AppointmentToolFactory.create(salonId, clientId)
}

/**
 * Tool para buscar serviços do salão
 * @deprecated Use ServicesToolFactory.create() instead
 */
export function createGetServicesTool(salonId: string) {
  return ServicesToolFactory.create(salonId)
}

/**
 * Tool para buscar produtos do salão
 * @deprecated Use ProductsToolFactory.create() instead
 */
export function createGetProductsTool(salonId: string) {
  return ProductsToolFactory.create(salonId)
}

/**
 * Tool para buscar profissionais
 * @deprecated Use ProfessionalsToolFactory.create() instead
 */
export function createGetProfessionalsTool(salonId: string) {
  return ProfessionalsToolFactory.create(salonId)
}

/**
 * Tool para salvar preferências do usuário proativamente
 * @deprecated Use PreferencesToolFactory.create() instead
 */
export function createSaveUserPreferencesTool(salonId: string, clientId?: string) {
  return PreferencesToolFactory.create(salonId, clientId)
}

// ============================================================================
// Utility Functions (Domain)
// ============================================================================

/**
 * Garante que uma data ISO tenha timezone
 */
export function ensureIsoWithTimezone(input: unknown): unknown {
  if (typeof input !== "string") return input
  const s = input.trim()
  // Já tem timezone
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s
  // YYYY-MM-DDTHH:mm -> adiciona segundos + -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00-03:00`
  // YYYY-MM-DDTHH:mm:ss -> adiciona -03:00
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return `${s}-03:00`
  return s
}

// ============================================================================
// Legacy Exports (for compatibility - can be removed in future)
// ============================================================================

import { openai } from "@ai-sdk/openai"
import { generateText, type CoreMessage } from "ai"
import type { ChatMessage } from "@/lib/types/chat"
import { AI_MODEL_CONSTANTS } from "@/lib/constants/ai.constants"

/**
 * Gera resposta de texto usando IA
 * @deprecated This function is legacy and should be replaced with streamText in routes
 */
export async function generateAIResponse(params: {
  systemPrompt: string
  messages: ChatMessage[]
  tools?: Parameters<typeof generateText>[0]["tools"]
  model?: string
}): Promise<{ text: string; toolResults?: unknown[] }> {
  const { systemPrompt, messages, tools, model = AI_MODEL_CONSTANTS.DEFAULT_FULL_MODEL } = params

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
