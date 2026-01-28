import { createCoreTools } from "./core"
import { createAppointmentTools } from "./appointments"
import { createGoogleCalendarTools } from "./google-calendar-tools"
import { createTrinksTools } from "./trinks-tools"
import { getActiveIntegrations, type ActiveIntegrations } from "../src/MinhaAgendaAI_tools"

/**
 * Logger para MCP Tools
 */
function logToolsLoaded(toolNames: string[], sourceFile: string, context: { salonId: string; clientPhone: string }) {
  console.log('\n📦 [MCP Tools] Tools carregadas para o LLM:')
  console.log(`   📁 Arquivo: ${sourceFile}`)
  console.log(`   🏪 Salon ID: ${context.salonId}`)
  console.log(`   📱 Client Phone: ${context.clientPhone}`)
  console.log(`   🔧 Tools (${toolNames.length}):`)
  toolNames.forEach(name => {
    console.log(`      - ${name}`)
  })
  console.log('')
}

/**
 * Adapter de tools para o AI SDK (Vercel AI SDK).
 *
 * Carrega tools dinamicamente baseado nas integrações ativas do salão:
 * - Se Google Calendar está ativo: carrega google_* tools
 * - Se Trinks está ativo: carrega trinks_* tools
 * - Se ambos ativos: carrega ambas as tools
 * - Se nenhum ativo: carrega tools default (checkAvailability, addAppointment, etc)
 *
 * Tools core (getServices, getProfessionals, etc) sempre são carregadas.
 */
export async function createMCPTools(salonId: string, clientPhone: string) {
  const context = { salonId, clientPhone }
  
  // Cria tools core (sempre disponíveis)
  const coreTools = createCoreTools(salonId, clientPhone)
  const coreToolNames = Object.keys(coreTools)
  logToolsLoaded(coreToolNames, 'packages/mcp-server/tools/core.ts', context)

  // Verifica integrações ativas para o salão
  const integrations = await getActiveIntegrations(salonId)
  
  // Determina quais tools de agendamento carregar
  const { tools: appointmentTools, sourceFile } = await resolveAppointmentToolsWithSource(
    salonId, 
    clientPhone, 
    integrations
  )
  const appointmentToolNames = Object.keys(appointmentTools)
  logToolsLoaded(appointmentToolNames, sourceFile, context)

  // Log resumo final
  const allTools = { ...coreTools, ...appointmentTools }
  console.log('✅ [MCP Tools] Resumo final:')
  console.log(`   Total de tools carregadas: ${Object.keys(allTools).length}`)
  console.log(`   Integrações: Google=${integrations.google?.isActive ?? false}, Trinks=${integrations.trinks?.isActive ?? false}`)
  console.log('')

  // Agrega todas as tools
  return allTools
}

/**
 * Resolve quais tools de agendamento carregar baseado nas integrações ativas
 * Retorna as tools e o arquivo de origem para logging
 */
async function resolveAppointmentToolsWithSource(
  salonId: string,
  clientPhone: string,
  integrations: ActiveIntegrations
): Promise<{ tools: Record<string, unknown>; sourceFile: string }> {
  const hasGoogle = integrations.google?.isActive === true
  const hasTrinks = integrations.trinks?.isActive === true

  console.log('\n🔍 [MCP Tools] Resolvendo tools de agendamento:')
  console.log(`   Google ativo: ${hasGoogle}${hasGoogle ? ` (${integrations.google?.email})` : ''}`)
  console.log(`   Trinks ativo: ${hasTrinks}`)

  // Ambas integrações ativas: carrega tools de ambas
  if (hasGoogle && hasTrinks) {
    console.log('   ➡️ Carregando: Google Calendar Tools + Trinks Tools')
    const googleTools = createGoogleCalendarTools(salonId, clientPhone)
    const trinksTools = createTrinksTools(salonId, clientPhone)
    
    return {
      tools: { ...googleTools, ...trinksTools },
      sourceFile: 'packages/mcp-server/tools/google-calendar-tools.ts + trinks-tools.ts',
    }
  }

  // Apenas Google ativo
  if (hasGoogle) {
    console.log('   ➡️ Carregando: Google Calendar Tools')
    return {
      tools: createGoogleCalendarTools(salonId, clientPhone),
      sourceFile: 'packages/mcp-server/tools/google-calendar-tools.ts',
    }
  }

  // Apenas Trinks ativo
  if (hasTrinks) {
    console.log('   ➡️ Carregando: Trinks Tools')
    return {
      tools: createTrinksTools(salonId, clientPhone),
      sourceFile: 'packages/mcp-server/tools/trinks-tools.ts',
    }
  }

  // Nenhuma integração ativa: usa tools default
  console.log('   ➡️ Carregando: Default Appointment Tools (sem integração)')
  return {
    tools: createAppointmentTools(salonId, clientPhone),
    sourceFile: 'packages/mcp-server/tools/appointments.ts',
  }
}

/**
 * Retorna informações sobre quais integrações estão ativas para um salão
 * Útil para debugging e diagnóstico
 */
export async function getIntegrationStatus(salonId: string): Promise<ActiveIntegrations> {
  return getActiveIntegrations(salonId)
}
