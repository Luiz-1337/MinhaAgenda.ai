import type { ICalendarIntegration, CalendarEventResult } from '../../../domain/integrations/interfaces/calendar-integration.interface'
import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import type { SalonId } from '../../../domain/integrations/value-objects/salon-id'
import type { EventId } from '../../../domain/integrations/value-objects/event-id'
import { google } from 'googleapis'
import { GoogleOAuth2Client } from './google-oauth2-client'
import { mapAppointmentToGoogleEvent } from '../../../application/use-cases/google-calendar/helpers/appointment-mapper'
import { GOOGLE_TIMEZONE_DEFAULT } from '../../../domain/constants'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { DomainError } from '../../../domain/errors/domain-error'
import { createEventId } from '../../../domain/integrations/value-objects/index'

/**
 * Google Calendar integration implementation
 */
export class GoogleCalendarIntegration implements ICalendarIntegration {
  private readonly oauth2Client: GoogleOAuth2Client

  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly logger: ILogger
  ) {
    this.oauth2Client = new GoogleOAuth2Client(this.logger)
  }

  async ensureProfessionalCalendar(
    professionalId: string,
    salonId: SalonId
  ): Promise<string | null> {
    const professional = await this.appointmentRepository.findProfessionalById(professionalId)

    if (!professional) {
      throw new DomainError(`Professional ${professionalId} not found`, 'PROFESSIONAL_NOT_FOUND', {
        professionalId,
      })
    }

    if (professional.googleCalendarId) {
      this.logger.debug('Professional already has calendar', {
        professionalId,
        calendarId: professional.googleCalendarId,
      })
      return professional.googleCalendarId
    }

    const calendarId = await this.createProfessionalCalendar(professionalId, salonId)
    if (calendarId) {
      await this.appointmentRepository.updateProfessionalCalendarId(professionalId, calendarId)
    }
    return calendarId
  }

  private async createProfessionalCalendar(
    professionalId: string,
    salonId: SalonId
  ): Promise<string | null> {
    const professional = await this.appointmentRepository.findProfessionalById(professionalId)

    if (!professional) {
      throw new DomainError(`Professional ${professionalId} not found`, 'PROFESSIONAL_NOT_FOUND', {
        professionalId,
      })
    }

    const googleClient = await this.oauth2Client.getSalonClient(salonId)
    if (!googleClient) {
      this.logger.warn('Google client not available - integration may not be configured', {
        salonId,
      })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: googleClient.client as never })
    const timeZone = process.env.GOOGLE_TIMEZONE || GOOGLE_TIMEZONE_DEFAULT
    const calendarName = `Agenda - ${professional.name}`

    try {
      this.logger.debug('Creating secondary calendar', {
        calendarName,
        professionalName: professional.name,
        timeZone,
      })

      const response = await calendar.calendars.insert({
        requestBody: {
          summary: calendarName,
          description: `Calendário de agendamentos do profissional ${professional.name}`,
          timeZone,
        },
      })

      const calendarId = response.data.id
      if (!calendarId) {
        throw new IntegrationError(
          'Calendar created but ID not returned by API',
          'google',
          { professionalId, salonId }
        )
      }

      this.logger.info('Secondary calendar created successfully', {
        professionalId,
        calendarId,
      })

      return calendarId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to create secondary calendar', { professionalId, error: errorMessage }, error as Error)
      throw new IntegrationError(`Failed to create secondary calendar: ${errorMessage}`, 'google', {
        professionalId,
        salonId,
      })
    }
  }

  async createEvent(appointmentId: AppointmentId): Promise<CalendarEventResult | null> {
    this.logger.debug('Creating Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findByIdWithRelations(appointmentId)
    if (!appointment) {
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    const calendarId = await this.ensureProfessionalCalendar(
      appointment.professionalId,
      appointment.salonId
    )
    if (!calendarId) {
      this.logger.warn('Could not get/create calendar - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    const googleClient = await this.oauth2Client.getSalonClient(appointment.salonId)
    if (!googleClient) {
      this.logger.warn('Google client not available - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: googleClient.client as never })
    const timeZone = process.env.GOOGLE_TIMEZONE || GOOGLE_TIMEZONE_DEFAULT
    const event = mapAppointmentToGoogleEvent(appointment, timeZone)

    try {
      this.logger.debug('Sending event to Google Calendar', {
        calendarId,
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime,
      })

      const response = await calendar.events.insert({
        calendarId,
        requestBody: event,
      })

      const createdEvent = response.data
      if (!createdEvent.id) {
        throw new IntegrationError('Event created but ID not returned', 'google', { appointmentId })
      }

      this.logger.info('Event created successfully in Google Calendar', {
        appointmentId,
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
      })

      return {
        eventId: createEventId(createdEvent.id),
        htmlLink: createdEvent.htmlLink || undefined,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to create event in Google Calendar', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to sync with Google Calendar: ${errorMessage}`, 'google', {
        appointmentId,
      })
    }
  }

  async updateEvent(appointmentId: AppointmentId): Promise<CalendarEventResult | null> {
    this.logger.debug('Updating Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findByIdWithRelations(appointmentId)
    if (!appointment) {
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!appointment.googleEventId) {
      this.logger.info('Appointment has no googleEventId, creating new event instead', {
        appointmentId,
      })
      return this.createEvent(appointmentId)
    }

    const calendarId =
      appointment.professionalGoogleCalendarId ||
      (await this.ensureProfessionalCalendar(appointment.professionalId, appointment.salonId))

    if (!calendarId) {
      this.logger.warn('Could not get/create calendar - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    const googleClient = await this.oauth2Client.getSalonClient(appointment.salonId)
    if (!googleClient) {
      this.logger.warn('Google client not available - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: googleClient.client as never })
    const timeZone = process.env.GOOGLE_TIMEZONE || GOOGLE_TIMEZONE_DEFAULT
    const event = mapAppointmentToGoogleEvent(appointment, timeZone)

    try {
      this.logger.debug('Updating event in Google Calendar', {
        calendarId,
        eventId: appointment.googleEventId,
        summary: event.summary,
      })

      const response = await calendar.events.update({
        calendarId,
        eventId: appointment.googleEventId,
        requestBody: event,
      })

      const updatedEvent = response.data
      if (!updatedEvent.id) {
        throw new IntegrationError('Event updated but ID not returned', 'google', { appointmentId })
      }

      this.logger.info('Event updated successfully in Google Calendar', {
        appointmentId,
        eventId: updatedEvent.id,
        htmlLink: updatedEvent.htmlLink,
      })

      return {
        eventId: createEventId(updatedEvent.id),
        htmlLink: updatedEvent.htmlLink || undefined,
      }
    } catch (error) {
      const errorObj = error as Record<string, unknown>
      if (errorObj.code === 404) {
        this.logger.info('Event not found in Google Calendar, creating new event', { appointmentId })
        await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', null)
        return this.createEvent(appointmentId)
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to update event in Google Calendar', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to update event in Google Calendar: ${errorMessage}`, 'google', {
        appointmentId,
      })
    }
  }

  async deleteEvent(appointmentId: AppointmentId): Promise<boolean | null> {
    this.logger.debug('Deleting Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findById(appointmentId)
    if (!appointment) {
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!appointment.googleEventId) {
      this.logger.debug('Appointment has no googleEventId, nothing to delete', { appointmentId })
      return false
    }

    const professional = await this.appointmentRepository.findProfessionalById(appointment.professionalId)
    if (!professional || !professional.googleCalendarId) {
      this.logger.warn(
        'Professional not found or has no calendar. Cannot delete event.',
        { appointmentId, professionalId: appointment.professionalId }
      )
      return null
    }

    const googleClient = await this.oauth2Client.getSalonClient(appointment.salonId)
    if (!googleClient) {
      this.logger.warn('Google client not available - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: googleClient.client as never })

    try {
      this.logger.debug('Deleting event from Google Calendar', {
        calendarId: professional.googleCalendarId,
        eventId: appointment.googleEventId,
      })

      await calendar.events.delete({
        calendarId: professional.googleCalendarId,
        eventId: appointment.googleEventId,
      })

      this.logger.info('Event deleted successfully from Google Calendar', { appointmentId })

      await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', null)

      return true
    } catch (error) {
      const errorObj = error as Record<string, unknown>
      if (errorObj.code === 404) {
        this.logger.info('Event not found in Google Calendar (already deleted), removing reference', {
          appointmentId,
        })
        await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', null)
        return true
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to delete event from Google Calendar', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to delete event from Google Calendar: ${errorMessage}`, 'google', {
        appointmentId,
      })
    }
  }
}
