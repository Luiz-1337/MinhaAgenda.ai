/**
 * Helper functions for Trinks integration
 * These functions instantiate the use cases with required dependencies
 */

import { AppointmentRepository } from '../infrastructure/repositories/appointment-repository'
import { logger } from '../infrastructure/logger'
import { createAppointmentId } from '../domain/integrations/value-objects/index'
import { CreateTrinksAppointmentUseCase } from '../application/use-cases/trinks/create-trinks-appointment.use-case'
import { UpdateTrinksAppointmentUseCase } from '../application/use-cases/trinks/update-trinks-appointment.use-case'
import { DeleteTrinksAppointmentUseCase } from '../application/use-cases/trinks/delete-trinks-appointment.use-case'
import { FetchTrinksResourcesUseCase } from '../application/use-cases/trinks/fetch-trinks-resources.use-case'
import { TrinksApiClient } from '../application/use-cases/trinks/services/trinks-api-client'
import { createSalonId } from '../domain/integrations/value-objects/index'
import type { AppointmentId } from '../domain/integrations/value-objects/appointment-id'
import type { TrinksResourceType } from '../application/use-cases/trinks/fetch-trinks-resources.use-case'

/**
 * Creates a Trinks appointment
 * @param appointmentId - The appointment ID
 * @param salonId - The salon ID
 * @returns The created event ID or null if integration is not active
 */
export async function createTrinksAppointment(
  appointmentId: string | AppointmentId,
  salonId: string
): Promise<{ eventId: string } | null> {
  const appointmentRepository = new AppointmentRepository()
  const useCase = new CreateTrinksAppointmentUseCase(
    appointmentRepository,
    logger,
    salonId
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  const result = await useCase.execute(id)
  return result ? { eventId: result.eventId as string } : null
}

/**
 * Updates a Trinks appointment
 * If appointment doesn't exist in Trinks, creates a new one
 * @param appointmentId - The appointment ID
 * @param salonId - The salon ID
 * @returns The updated event ID or null if integration is not active
 */
export async function updateTrinksAppointment(
  appointmentId: string | AppointmentId,
  salonId: string
): Promise<{ eventId: string } | null> {
  const appointmentRepository = new AppointmentRepository()
  const createUseCase = new CreateTrinksAppointmentUseCase(
    appointmentRepository,
    logger,
    salonId
  )
  const useCase = new UpdateTrinksAppointmentUseCase(
    appointmentRepository,
    logger,
    salonId,
    createUseCase
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  const result = await useCase.execute(id)
  return result ? { eventId: result.eventId as string } : null
}

/**
 * Deletes a Trinks appointment
 * @param appointmentId - The appointment ID
 * @param salonId - The salon ID
 * @returns true if deleted, false if no event ID, null if integration is not active
 */
export async function deleteTrinksAppointment(
  appointmentId: string | AppointmentId,
  salonId: string
): Promise<boolean | null> {
  const appointmentRepository = new AppointmentRepository()
  const useCase = new DeleteTrinksAppointmentUseCase(
    appointmentRepository,
    logger,
    salonId
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  return await useCase.execute(id)
}

/**
 * Checks if Trinks integration is active for a salon
 * @param salonId - The salon ID
 * @returns true if integration is active, false otherwise
 */
export async function isTrinksIntegrationActive(salonId: string): Promise<boolean> {
  const apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  return await apiClient.isActive()
}

/**
 * Fetches Trinks resources (professionals, services, or products)
 * @param salonId - The salon ID
 * @param resourceType - The type of resource to fetch
 * @returns Array of resources
 */
export async function fetchTrinksResources(
  salonId: string,
  resourceType: TrinksResourceType
): Promise<unknown[]> {
  const useCase = new FetchTrinksResourcesUseCase(logger, salonId)
  return await useCase.execute(resourceType)
}

/**
 * Fetches Trinks professionals
 * @param salonId - The salon ID
 * @returns Array of professionals
 */
export async function getTrinksProfessionals(salonId: string): Promise<unknown[]> {
  return await fetchTrinksResources(salonId, 'profissionais')
}

/**
 * Fetches Trinks services
 * @param salonId - The salon ID
 * @returns Array of services
 */
export async function getTrinksServices(salonId: string): Promise<unknown[]> {
  return await fetchTrinksResources(salonId, 'servicos')
}

/**
 * Fetches Trinks products
 * @param salonId - The salon ID
 * @returns Array of products
 */
export async function getTrinksProducts(salonId: string): Promise<unknown[]> {
  return await fetchTrinksResources(salonId, 'produtos')
}

/**
 * Interface para agendamento do Trinks
 */
export interface TrinksAppointment {
  id: string
  dataInicio: string
  dataFim: string
  profissionalId?: string
  status?: string
}

/**
 * Fetches Trinks appointments for a specific date range
 * @param salonId - The salon ID
 * @param startDate - Start of the date range
 * @param endDate - End of the date range
 * @param professionalId - Optional professional ID to filter
 * @returns Array of appointments from Trinks
 */
export async function getTrinksAppointments(
  salonId: string,
  startDate: Date,
  endDate: Date,
  professionalId?: string
): Promise<TrinksAppointment[]> {
  const apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  
  const isActive = await apiClient.isActive()
  if (!isActive) {
    return []
  }

  try {
    // Formata as datas para o formato esperado pela API do Trinks
    const startStr = startDate.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]
    
    // Consulta agendamentos no período
    let endpoint = `/agendamentos?dataInicio=${startStr}&dataFim=${endStr}`
    if (professionalId) {
      endpoint += `&profissionalId=${professionalId}`
    }

    const appointments = await apiClient.request<TrinksAppointment[]>(endpoint)
    return appointments || []
  } catch (error) {
    logger.error('Failed to fetch Trinks appointments', { salonId, error })
    return []
  }
}

/**
 * Gets busy time slots from Trinks for a specific professional
 * Returns array of { start, end } periods that are occupied
 * @param salonId - The salon ID
 * @param professionalId - The professional ID
 * @param timeMin - Start of the time range
 * @param timeMax - End of the time range
 * @returns Array of busy periods
 */
export async function getTrinksBusySlots(
  salonId: string,
  professionalId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const appointments = await getTrinksAppointments(salonId, timeMin, timeMax, professionalId)
  
  return appointments
    .filter(apt => apt.dataInicio && apt.dataFim && apt.status !== 'cancelado')
    .map(apt => ({
      start: new Date(apt.dataInicio),
      end: new Date(apt.dataFim),
    }))
}
