/**
 * Factory para criação de tools de IA (APPLICATION LAYER)
 */

import { getAvailableSlots } from "@/lib/availability"
import {
  createAvailabilityTool,
  createBookAppointmentTool,
  createGetServicesTool,
  createGetProfessionalsTool,
  createSaveUserPreferencesTool,
} from "@/lib/services/ai.service"

export class AIToolsFactory {
  /**
   * Cria todas as tools necessárias para o chat
   */
  static createTools(salonId: string, clientId?: string) {
    const checkAvailability = createAvailabilityTool(salonId, async (params) => {
      return await getAvailableSlots({
        date: params.date,
        salonId: params.salonId,
        serviceDuration: params.serviceDuration,
        professionalId: params.professionalId,
      })
    })

    const bookAppointment = createBookAppointmentTool(salonId, clientId)
    const getServices = createGetServicesTool(salonId)
    const getProfessionals = createGetProfessionalsTool(salonId)
    const saveUserPreferences = createSaveUserPreferencesTool(salonId, clientId)

    return {
      checkAvailability,
      bookAppointment,
      getServices,
      getProfessionals,
      saveUserPreferences,
    }
  }
}
