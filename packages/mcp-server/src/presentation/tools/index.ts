import { Container } from "../../container"
import { createAppointmentTools } from "./appointment.tools"
import { createAvailabilityTools } from "./availability.tools"
import { createCustomerTools } from "./customer.tools"
import { createCatalogTools } from "./catalog.tools"
import { createSalonTools } from "./salon.tools"

export { createAppointmentTools } from "./appointment.tools"
export { createAvailabilityTools } from "./availability.tools"
export { createCustomerTools } from "./customer.tools"
export { createCatalogTools } from "./catalog.tools"
export { createSalonTools } from "./salon.tools"

/**
 * Registra todas as tools no container
 */
export function registerAllTools(
  container: Container,
  salonId: string,
  clientPhone: string
) {
  return {
    ...createAppointmentTools(container, salonId, clientPhone),
    ...createAvailabilityTools(container, salonId, clientPhone),
    ...createCustomerTools(container, salonId, clientPhone),
    ...createCatalogTools(container, salonId, clientPhone),
    ...createSalonTools(container, salonId, clientPhone),
  }
}

/**
 * Tipo das tools registradas
 */
export type MCPTools = ReturnType<typeof registerAllTools>
