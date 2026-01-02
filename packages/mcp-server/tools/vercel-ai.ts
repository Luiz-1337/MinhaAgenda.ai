import { createCoreTools } from "./core"
import { createAppointmentTools } from "./appointments"

/**
 * Adapter de tools para o AI SDK (Vercel AI SDK).
 *
 * Opção A: tools locais (o `apps/web` atua como host chamando o modelo e executando tools),
 * sem necessidade de rodar um MCP server HTTP/stdio em produção.
 *
 * Agrega tools:
 * - Tools core: sempre disponíveis
 * - Tools appointments: sempre disponíveis (inclui addAppointment, updateAppointment, removeAppointment)
 */
export async function createMCPTools(salonId: string, clientPhone: string) {
  // Cria tools core (sempre disponíveis)
  const coreTools = createCoreTools(salonId, clientPhone)

  // Cria tools de agendamento (sempre disponíveis)
  const appointmentTools = createAppointmentTools(salonId, clientPhone)

  // Agrega todas as tools
  return {
    ...coreTools,
    ...appointmentTools,
  }
}
