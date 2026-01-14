/**
 * Helper functions for Google Calendar integration
 * These functions instantiate the use cases with required dependencies
 */

import { AppointmentRepository } from '../infrastructure/repositories/appointment-repository'
import { GoogleCalendarIntegration } from '../infrastructure/integrations/google-calendar/google-calendar-integration'
import { GoogleOAuth2Client } from '../infrastructure/integrations/google-calendar/google-oauth2-client'
import { logger } from '../infrastructure/logger'
import { createAppointmentId, createSalonId } from '../domain/integrations/value-objects/index'
import { CreateGoogleEventUseCase } from '../application/use-cases/google-calendar/create-google-event.use-case'
import { UpdateGoogleEventUseCase } from '../application/use-cases/google-calendar/update-google-event.use-case'
import { DeleteGoogleEventUseCase } from '../application/use-cases/google-calendar/delete-google-event.use-case'
import { EnsureProfessionalCalendarUseCase } from '../application/use-cases/google-calendar/ensure-professional-calendar.use-case'
import type { AppointmentId } from '../domain/integrations/value-objects/appointment-id'
import type { SalonId } from '../domain/integrations/value-objects/salon-id'

/**
 * Creates a Google Calendar event for an appointment
 * @param appointmentId - The appointment ID
 * @returns The created event ID and HTML link, or null if integration is not active
 */
export async function createGoogleEvent(
  appointmentId: string | AppointmentId
): Promise<{ eventId: string; htmlLink?: string } | null> {
  const appointmentRepository = new AppointmentRepository()
  const calendarIntegration = new GoogleCalendarIntegration(appointmentRepository, logger)
  const useCase = new CreateGoogleEventUseCase(
    appointmentRepository,
    calendarIntegration,
    logger
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  const result = await useCase.execute(id)
  return result ? { eventId: result.eventId as string, htmlLink: result.htmlLink } : null
}

/**
 * Updates a Google Calendar event
 * If event doesn't exist, creates a new one
 * @param appointmentId - The appointment ID
 * @returns The updated event ID and HTML link, or null if integration is not active
 */
export async function updateGoogleEvent(
  appointmentId: string | AppointmentId
): Promise<{ eventId: string; htmlLink?: string } | null> {
  const appointmentRepository = new AppointmentRepository()
  const calendarIntegration = new GoogleCalendarIntegration(appointmentRepository, logger)
  const createUseCase = new CreateGoogleEventUseCase(
    appointmentRepository,
    calendarIntegration,
    logger
  )
  const useCase = new UpdateGoogleEventUseCase(
    appointmentRepository,
    calendarIntegration,
    createUseCase,
    logger
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  const result = await useCase.execute(id)
  return result ? { eventId: result.eventId as string, htmlLink: result.htmlLink } : null
}

/**
 * Deletes a Google Calendar event
 * IMPORTANT: Must be called BEFORE deleting appointment from database
 * @param appointmentId - The appointment ID
 * @returns true if deleted, false if no event ID, null if integration is not active
 */
export async function deleteGoogleEvent(
  appointmentId: string | AppointmentId
): Promise<boolean | null> {
  const appointmentRepository = new AppointmentRepository()
  const calendarIntegration = new GoogleCalendarIntegration(appointmentRepository, logger)
  const useCase = new DeleteGoogleEventUseCase(
    appointmentRepository,
    calendarIntegration,
    logger
  )
  
  const id = typeof appointmentId === 'string' 
    ? createAppointmentId(appointmentId) 
    : appointmentId
  
  return await useCase.execute(id)
}

/**
 * Ensures a professional has a Google Calendar
 * Idempotent: if calendar exists, returns existing ID
 * @param professionalId - The professional ID
 * @param salonId - The salon ID
 * @returns The calendar ID or null if integration is not active
 */
export async function ensureProfessionalCalendar(
  professionalId: string,
  salonId: string | SalonId
): Promise<string | null> {
  const appointmentRepository = new AppointmentRepository()
  const calendarIntegration = new GoogleCalendarIntegration(appointmentRepository, logger)
  const useCase = new EnsureProfessionalCalendarUseCase(
    appointmentRepository,
    calendarIntegration,
    logger
  )
  
  const id = typeof salonId === 'string' 
    ? createSalonId(salonId) 
    : salonId
  
  return await useCase.execute(professionalId, id)
}

/**
 * Gets an OAuth2 client for a salon
 * @param salonId - The salon ID
 * @returns OAuth2 client result or null if not configured
 */
export async function getOAuth2Client(salonId: string | SalonId) {
  const oauth2Client = new GoogleOAuth2Client(logger)
  const id = typeof salonId === 'string' 
    ? createSalonId(salonId) 
    : salonId
  return await oauth2Client.getSalonClient(id)
}

/**
 * Gets a Google client for a salon (alias for getOAuth2Client)
 * @param salonId - The salon ID
 * @returns OAuth2 client result or null if not configured
 */
export async function getSalonGoogleClient(salonId: string | SalonId) {
  return await getOAuth2Client(salonId)
}

/**
 * Gets the raw OAuth2 client (not authenticated)
 * Useful for generating auth URLs
 * @returns OAuth2Client instance from google-auth-library
 */
export function getRawOAuth2Client() {
  const oauth2Client = new GoogleOAuth2Client(logger)
  return oauth2Client.getRawClient()
}
