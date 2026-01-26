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

function isGmail(email: string | null | undefined): boolean {
  return /^[^@]+@(gmail|googlemail)\.com$/i.test(email ?? '')
}

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

    const isSolo = await this.appointmentRepository.isSoloPlan(salonId)
    const googleClient = await this.oauth2Client.getSalonClient(salonId)
    if (!googleClient) {
      this.logger.warn('Google client not available - integration may not be configured', { salonId })
      return null
    }

    // SOLO: calendário primário do dono (e-mail conectado)
    if (isSolo) {
      if (googleClient.email) {
        return googleClient.email
      }
      return null
    }

    // PRO/ENTERPRISE: calendário do e-mail do funcionário ou secundário na conta do dono
    if (professional.googleCalendarId) {
      this.logger.debug('Professional already has secondary calendar', {
        professionalId,
        calendarId: professional.googleCalendarId,
      })
      return professional.googleCalendarId
    }
    if (professional.email && isGmail(professional.email)) {
      return professional.email
    }
    // Não Gmail: criar calendário secundário na conta do dono
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

    let calendarId = await this.ensureProfessionalCalendar(
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
    const isSolo = await this.appointmentRepository.isSoloPlan(appointment.salonId)

    const tryInsert = async (calId: string) => {
      const response = await calendar.events.insert({
        calendarId: calId,
        requestBody: event,
      })
      return response.data
    }

    try {
      this.logger.debug('Sending event to Google Calendar', {
        calendarId,
        summary: event.summary,
        start: event.start.dateTime,
        end: event.end.dateTime,
      })

      let createdEvent = await tryInsert(calendarId)

      if (!createdEvent.id) {
        throw new IntegrationError('Event created but ID not returned', 'google', { appointmentId })
      }

      await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', createdEvent.id)

      this.logger.info('Event created successfully in Google Calendar', {
        appointmentId,
        eventId: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
      })

      return {
        eventId: createEventId(createdEvent.id),
        htmlLink: createdEvent.htmlLink || undefined,
      }
    } catch (error: unknown) {
      const errorObj = error as { code?: number; response?: { status?: number } }
      const status = errorObj?.code ?? errorObj?.response?.status
      const is403or404 = status === 403 || status === 404

      // Fallback: PRO + Gmail (calendário do funcionário não compartilhado) -> criar secundário na conta do dono
      if (is403or404 && !isSolo && isGmail(calendarId)) {
        this.logger.info('Insert failed with 403/404 on professional Gmail, falling back to secondary calendar', {
          appointmentId,
          calendarId,
        })
        const fallbackCalendarId = await this.createProfessionalCalendar(appointment.professionalId, appointment.salonId)
        if (!fallbackCalendarId) {
          const errMsg = error instanceof Error ? error.message : String(error)
          throw new IntegrationError(`Failed to sync with Google Calendar: ${errMsg}`, 'google', { appointmentId })
        }
        await this.appointmentRepository.updateProfessionalCalendarId(appointment.professionalId, fallbackCalendarId)

        const fallbackCreated = await tryInsert(fallbackCalendarId)
        if (!fallbackCreated.id) {
          throw new IntegrationError('Event created but ID not returned (fallback)', 'google', { appointmentId })
        }
        await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', fallbackCreated.id)
        this.logger.info('Event created in secondary calendar after Gmail fallback', {
          appointmentId,
          eventId: fallbackCreated.id,
        })
        return {
          eventId: createEventId(fallbackCreated.id),
          htmlLink: fallbackCreated.htmlLink || undefined,
        }
      }

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
    if (!professional) {
      this.logger.warn('Professional not found. Cannot delete event.', {
        appointmentId,
        professionalId: appointment.professionalId,
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

    const isSolo = await this.appointmentRepository.isSoloPlan(appointment.salonId)

    let calendarId: string | null
    if (isSolo) {
      calendarId = googleClient.email ?? null
    } else {
      calendarId = professional.googleCalendarId ?? null
      if (!calendarId && professional.email && isGmail(professional.email)) {
        calendarId = professional.email
      }
    }

    if (!calendarId) {
      this.logger.warn('Could not resolve calendarId for delete', { appointmentId })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: googleClient.client as never })

    try {
      this.logger.debug('Deleting event from Google Calendar', {
        calendarId,
        eventId: appointment.googleEventId,
      })

      await calendar.events.delete({
        calendarId,
        eventId: appointment.googleEventId,
      })

      this.logger.info('Event deleted successfully from Google Calendar', { appointmentId })

      await this.appointmentRepository.updateExternalEventId(appointmentId, 'google', null)

      return true
    } catch (error: unknown) {
      const errorObj = error as { code?: number; response?: { status?: number } }
      if (errorObj?.code === 404 || errorObj?.response?.status === 404) {
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
