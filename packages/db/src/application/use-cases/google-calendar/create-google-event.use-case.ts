import type { ICalendarIntegration } from '../../../domain/integrations/interfaces/calendar-integration.interface'
import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import type { EventId } from '../../../domain/integrations/value-objects/event-id'
import { DomainError } from '../../../domain/errors/domain-error'
import { createEventId } from '../../../domain/integrations/value-objects/index'

/**
 * Result of creating a Google Calendar event
 */
export interface CreateGoogleEventResult {
  eventId: EventId
  htmlLink?: string
}

/**
 * Use case for creating a Google Calendar event
 */
export class CreateGoogleEventUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly calendarIntegration: ICalendarIntegration,
    private readonly logger: ILogger
  ) {}

  async execute(appointmentId: AppointmentId): Promise<CreateGoogleEventResult | null> {
    this.logger.debug('Creating Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findByIdWithRelations(appointmentId)

    if (!appointment) {
      this.logger.error('Appointment not found', { appointmentId })
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    this.logger.debug('Appointment found for event creation', {
      appointmentId,
      salonId: appointment.salonId,
      professionalId: appointment.professionalId,
    })

    const result = await this.calendarIntegration.createEvent(appointmentId)

    if (!result) {
      this.logger.warn('Event creation returned null - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    this.logger.info('Google Calendar event created successfully', {
      appointmentId,
      eventId: result.eventId,
      htmlLink: result.htmlLink,
    })

    return {
      eventId: createEventId(result.eventId),
      htmlLink: result.htmlLink,
    }
  }
}
