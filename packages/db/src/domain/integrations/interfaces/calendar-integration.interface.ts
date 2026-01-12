import type { AppointmentId, EventId } from '../../integrations/value-objects'
import type { SalonId } from '../../integrations/value-objects/salon-id'

/**
 * Result of creating/updating an event in external calendar
 */
export interface CalendarEventResult {
  eventId: EventId
  htmlLink?: string
}

/**
 * Calendar integration interface (DIP - Dependency Inversion Principle)
 */
export interface ICalendarIntegration {
  /**
   * Ensures a professional has a secondary calendar
   * @returns Calendar ID or null if integration not configured
   */
  ensureProfessionalCalendar(professionalId: string, salonId: SalonId): Promise<string | null>

  /**
   * Creates an event in the external calendar
   * @returns Event result or null if integration not configured
   */
  createEvent(appointmentId: AppointmentId): Promise<CalendarEventResult | null>

  /**
   * Updates an existing event in the external calendar
   * @returns Event result or null if integration not configured
   */
  updateEvent(appointmentId: AppointmentId): Promise<CalendarEventResult | null>

  /**
   * Deletes an event from the external calendar
   * @returns true if deleted, false if no event existed, null if integration not configured
   */
  deleteEvent(appointmentId: AppointmentId): Promise<boolean | null>
}
