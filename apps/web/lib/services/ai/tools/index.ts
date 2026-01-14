/**
 * Index file that exports all tool factory functions
 * Provides a clean API for importing tools
 */

import { AvailabilityToolFactory } from './availability-tool-factory.service'
import { AppointmentToolFactory } from './appointment-tool-factory.service'
import { ServicesToolFactory } from './services-tool-factory.service'
import { ProductsToolFactory } from './products-tool-factory.service'
import { ProfessionalsToolFactory } from './professionals-tool-factory.service'
import { PreferencesToolFactory } from './preferences-tool-factory.service'

/**
 * Creates an availability tool
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
 * Creates a book appointment tool
 */
export function createBookAppointmentTool(salonId: string, clientId?: string) {
  return AppointmentToolFactory.create(salonId, clientId)
}

/**
 * Creates a get services tool
 */
export function createGetServicesTool(salonId: string) {
  return ServicesToolFactory.create(salonId)
}

/**
 * Creates a get products tool
 */
export function createGetProductsTool(salonId: string) {
  return ProductsToolFactory.create(salonId)
}

/**
 * Creates a get professionals tool
 */
export function createGetProfessionalsTool(salonId: string) {
  return ProfessionalsToolFactory.create(salonId)
}

/**
 * Creates a save user preferences tool
 */
export function createSaveUserPreferencesTool(salonId: string, clientId?: string) {
  return PreferencesToolFactory.create(salonId, clientId)
}
