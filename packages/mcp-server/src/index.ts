/**
 * MinhaAgendaAI MCP Server
 *
 * Este pacote tem dois usos:
 * 1. MCP server (stdio): Servidor MCP via stdio para uso com Claude Desktop
 * 2. Tools locais para Vercel AI SDK: Adapter de tools para uso direto
 */

// Container e DI
import { container as containerInstance, registerProviders as registerProvidersFunc, TOKENS as TOKEN_CONSTANTS } from "./container"
export { Container } from "./container"
export const container = containerInstance
export const registerProviders = registerProvidersFunc
export const TOKENS = TOKEN_CONSTANTS

// Tools para Vercel AI SDK
import { registerAllTools as registerAllToolsFunc } from "./presentation/tools"
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
} from "./presentation/schemas"

// Presenters para formatação
export * from "./presentation/presenters"

// DTOs
export * from "./application/dtos"

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
 * Cria as tools MCP para uso com Vercel AI SDK
 * Esta é a função principal para integração
 */
export async function createMCPTools(salonId: string, clientPhone: string) {
  // Registra providers se ainda não foram registrados
  if (!containerInstance.has(TOKEN_CONSTANTS.AppointmentRepository)) {
    registerProvidersFunc(containerInstance)
  }

  return registerAllToolsFunc(containerInstance, salonId, clientPhone)
}

// Entry point para execução direta como MCP server
if (typeof require !== "undefined" && require.main === module) {
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
