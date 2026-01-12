import type { ICalendarIntegration } from '../../../domain/integrations/interfaces/calendar-integration.interface'
import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import type { EventId } from '../../../domain/integrations/value-objects/event-id'
import { DomainError } from '../../../domain/errors/domain-error'
import { createEventId } from '../../../domain/integrations/value-objects/index'
import { CreateGoogleEventUseCase } from './create-google-event.use-case'

/**
 * Result of updating a Google Calendar event
 */
export interface UpdateGoogleEventResult {
  eventId: EventId
  htmlLink?: string
}

/**
 * Use case for updating a Google Calendar event
 * If event doesn't exist, creates a new one
 */
export class UpdateGoogleEventUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly calendarIntegration: ICalendarIntegration,
    private readonly createUseCase: CreateGoogleEventUseCase,
    private readonly logger: ILogger
  ) {}

  async execute(appointmentId: AppointmentId): Promise<UpdateGoogleEventResult | null> {
    this.logger.debug('Updating Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findByIdWithRelations(appointmentId)

    if (!appointment) {
      this.logger.error('Appointment not found', { appointmentId })
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!appointment.googleEventId) {
      this.logger.info('Appointment has no googleEventId, creating new event instead', {
        appointmentId,
      })
      const createResult = await this.createUseCase.execute(appointmentId)
      if (!createResult) {
        return null
      }
      return {
        eventId: createResult.eventId,
        htmlLink: createResult.htmlLink,
      }
    }

    const result = await this.calendarIntegration.updateEvent(appointmentId)

    if (!result) {
      this.logger.warn('Event update returned null - integration may not be configured', {
        appointmentId,
      })
      return null
    }

    this.logger.info('Google Calendar event updated successfully', {
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
