import type { AppointmentId } from '../value-objects/appointment-id'
import type { SalonId } from '../value-objects/salon-id'

/**
 * Appointment data with related information
 */
export interface AppointmentWithRelations {
  id: AppointmentId
  salonId: SalonId
  professionalId: string
  clientId: string
  serviceId: string
  date: Date
  endTime: Date
  status: string
  notes: string | null
  googleEventId: string | null
  trinksEventId: string | null
  professionalName: string
  professionalEmail: string | null
  serviceName: string
  serviceDuration: number | null
  clientName: string
  clientEmail: string | null
  clientPhone: string | null
  professionalGoogleCalendarId?: string | null
}

/**
 * Appointment repository interface (DIP - Dependency Inversion Principle)
 */
export interface IAppointmentRepository {
  /**
   * Finds appointment by ID with all relations
   */
  findByIdWithRelations(appointmentId: AppointmentId): Promise<AppointmentWithRelations | null>

  /**
   * Finds appointment by ID with minimal fields
   */
  findById(appointmentId: AppointmentId): Promise<{
    id: AppointmentId
    salonId: SalonId
    professionalId: string
    googleEventId: string | null
    trinksEventId: string | null
  } | null>

  /**
   * Updates appointment's external event ID
   */
  updateExternalEventId(
    appointmentId: AppointmentId,
    provider: 'google' | 'trinks',
    eventId: string | null
  ): Promise<void>

  /**
   * Finds professional by ID
   */
  findProfessionalById(professionalId: string): Promise<{
    id: string
    name: string
    email: string | null
    googleCalendarId: string | null
  } | null>

  /**
   * Updates professional's Google Calendar ID
   */
  updateProfessionalCalendarId(professionalId: string, calendarId: string): Promise<void>

  /**
   * Checks if the salon is on the SOLO plan (owner's profile tier === 'SOLO')
   */
  isSoloPlan(salonId: SalonId): Promise<boolean>
}
