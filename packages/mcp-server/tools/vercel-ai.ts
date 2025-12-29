import { createCoreTools } from "./core"
import { createAppointmentTools } from "./appointments"
import { createGoogleCalendarTools } from "./google-calendar"
import { getIntegrationStatus } from "./types"

/**
 * Adapter de tools para o AI SDK (Vercel AI SDK).
 *
 * Opção A: tools locais (o `apps/web` atua como host chamando o modelo e executando tools),
 * sem necessidade de rodar um MCP server HTTP/stdio em produção.
 *
 * Agrega tools baseado nas integrações ativas do salão:
 * - Tools core: sempre disponíveis
 * - Tools appointments: sempre disponíveis
 * - Tools Google Calendar: apenas se integração estiver ativa
 */
export async function createMCPTools(salonId: string, clientPhone: string) {
  // Busca status das integrações
  const integrations = await getIntegrationStatus(salonId)

  // Cria tools core (sempre disponíveis)
  const coreTools = createCoreTools(salonId, clientPhone)

  // Cria tools de agendamento básicas (sempre disponíveis)
  const appointmentTools = createAppointmentTools(salonId, clientPhone)

  // Cria tools do Google Calendar apenas se integração estiver ativa
  const googleCalendarTools = integrations.googleCalendar
    ? createGoogleCalendarTools(salonId, clientPhone)
    : {}

  // Agrega todas as tools
  return {
    ...coreTools,
    ...appointmentTools,
    ...googleCalendarTools,
  }
}
