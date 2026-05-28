import { Container } from "../../container"
import { createAppointmentTools } from "./appointment.tools"
import { createAvailabilityTools } from "./availability.tools"
import { createCustomerTools } from "./customer.tools"
import { createCatalogTools } from "./catalog.tools"
import { createSalonTools } from "./salon.tools"
import type { ToolContext, ToolSet } from "./types"

export { createAppointmentTools } from "./appointment.tools"
export { createAvailabilityTools } from "./availability.tools"
export { createCustomerTools } from "./customer.tools"
export { createCatalogTools } from "./catalog.tools"
export { createSalonTools } from "./salon.tools"
export { defineTool } from "./defineTool"
export type { ToolContext, ToolDefinition, ToolSet } from "./types"

/**
 * Registra todas as tools no container.
 *
 * `chatId` é opcional — propagado apenas para tools que precisam dele
 * (setChatKanbanColumn). Tools de catálogo/disponibilidade/etc não usam.
 */
export function registerAllTools(
  container: Container,
  salonId: string,
  clientPhone: string,
  chatId?: string
): ToolSet {
  const ctx: ToolContext = { container, salonId, clientPhone, chatId }
  return {
    ...createAppointmentTools(ctx),
    ...createAvailabilityTools(ctx),
    ...createCustomerTools(ctx),
    ...createCatalogTools(ctx),
    ...createSalonTools(ctx),
  }
}

/**
 * Tipo das tools registradas
 */
export type MCPTools = ReturnType<typeof registerAllTools>
