/**
 * MinhaAgendaAI MCP Server
 *
 * Este pacote tem dois usos:
 * 1. MCP server (stdio): Servidor MCP via stdio para uso com Claude Desktop
 * 2. Tools locais para OpenAI Responses API: Adapter de tools para uso direto
 */

import { fileURLToPath } from "node:url"

// Container e DI
import { container as containerInstance, registerProviders as registerProvidersFunc, registerAiResponsesRunner as registerAiResponsesRunnerFunc, TOKENS as TOKEN_CONSTANTS } from "./container"
export { Container } from "./container"
export const container = containerInstance
export const registerProviders = registerProvidersFunc
export const registerAiResponsesRunner = registerAiResponsesRunnerFunc
export const TOKENS = TOKEN_CONSTANTS

// Use Cases - Retention (re-exported for direct app/web consumption)
export * from "./application/use-cases/retention"

// Use Cases - Trinks (Cliente 360° — re-exported for cron/worker in apps/web)
export * from "./application/use-cases/trinks"

// Tools locais para OpenAI Responses API (mantendo compatibilidade de import)
import { registerAllTools as registerAllToolsFunc } from "./presentation/tools"
import { NIL_UUID as NIL_UUID_CONST } from "./presentation/schemas/common.schema"
export {
  registerAllTools,
  createAppointmentTools,
  createAvailabilityTools,
  createCustomerTools,
  createCatalogTools,
  createSalonTools,
  type MCPTools,
} from "./presentation/tools"

// Schemas para validação (excluindo duplicados com shared/utils)
export {
  isoDateTimeSchema,
  isoDateTimeOptionalSchema,
  uuidSchema,
  uuidOptionalSchema,
  NIL_UUID,
  phoneSchema,
  leadInterestSchema,
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
  getMyFutureAppointmentsSchema,
  checkAvailabilitySchema,
  getProfessionalAvailabilityRulesSchema,
  identifyCustomerSchema,
  createCustomerSchema,
  updateCustomerNameSchema,
  getServicesSchema,
  getProductsSchema,
  getProfessionalsSchema,
  getSalonInfoSchema,
  saveCustomerPreferenceSchema,
  qualifyLeadSchema,
  setChatKanbanColumnSchema,
} from "./presentation/schemas"

// Presenters para formatação
export * from "./presentation/presenters"

// DTOs
export * from "./application/dtos"

// Domain services / ports
export * from "./domain/services"

// Domain repositories (interfaces only — implementations live in infrastructure)
export type {
  IRetentionRepository,
  InactiveCustomerRow,
  InactiveCursor,
  FindInactiveOptions,
  RecentRetentionInfo,
  FlagSuspectedOptOutInput,
  RetentionAuditRow,
  SetSentimentInput,
  MarkOptOutInput,
  MarkOptOutResult,
} from "./domain/repositories/IRetentionRepository"

// Types
export * from "./shared/types"

// Constants
export * from "./shared/constants"

// Utils
export * from "./shared/utils"

// MCP Server
import { start as startServer, stop as stopServer } from "./presentation/mcp-server"
export const start = startServer
export const stop = stopServer

/**
 * Cria as tools MCP para uso local com OpenAI Responses API.
 * Esta é a função principal para integração.
 *
 * Validação fail-fast: salonId e clientPhone DEVEM ser valores reais resolvidos
 * pelo webhook do WhatsApp. Um salonId vazio ou UUID nulo significa que o pipeline
 * de resolução upstream falhou — não faz sentido chamar a IA sem contexto válido.
 *
 * `chatId` é opcional: quando passado, ativa a tool `setChatKanbanColumn` para
 * a IA classificar o chat no Kanban durante a conversa.
 */
export async function createMCPTools(salonId: string, clientPhone: string, chatId?: string) {
  if (!salonId || salonId === NIL_UUID_CONST) {
    throw new Error(
      `createMCPTools: salonId inválido (recebido: ${JSON.stringify(salonId)}). O webhook do WhatsApp deve resolver o salonId antes de enfileirar o job.`
    )
  }
  if (!clientPhone) {
    throw new Error("createMCPTools: clientPhone vazio")
  }

  // Registra providers se ainda não foram registrados
  if (!containerInstance.has(TOKEN_CONSTANTS.AppointmentRepository)) {
    registerProvidersFunc(containerInstance)
  }

  return registerAllToolsFunc(containerInstance, salonId, clientPhone, chatId)
}

// Entry point para execução direta como MCP server (ESM-compatible)
const __filename = fileURLToPath(import.meta.url)
const isMain =
  process.argv[1] === __filename || process.argv[1]?.endsWith("index.ts")

if (isMain) {
  const salonId = process.env.SALON_ID
  const clientPhone = process.env.CLIENT_PHONE

  if (!salonId || !clientPhone) {
    console.error("SALON_ID e CLIENT_PHONE são obrigatórios")
    process.exit(1)
  }

  startServer(salonId, clientPhone).catch((error: unknown) => {
    console.error("Erro ao iniciar servidor MCP:", error)
    process.exit(1)
  })
}

