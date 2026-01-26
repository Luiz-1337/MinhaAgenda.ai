import type { ICalendarIntegration } from '../../../domain/integrations/interfaces/calendar-integration.interface'
import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import { DomainError } from '../../../domain/errors/domain-error'

/**
 * Use case for deleting a Google Calendar event
 * IMPORTANT: Must be called BEFORE deleting appointment from database
 */
export class DeleteGoogleEventUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly calendarIntegration: ICalendarIntegration,
    private readonly logger: ILogger
  ) {}

  async execute(appointmentId: AppointmentId): Promise<boolean | null> {
    this.logger.debug('Deleting Google Calendar event', { appointmentId })

    const appointment = await this.appointmentRepository.findById(appointmentId)

    if (!appointment) {
      this.logger.error('Appointment not found', { appointmentId })
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!appointment.googleEventId) {
      this.logger.debug('Appointment has no googleEventId, nothing to delete', { appointmentId })
      return false
    }

    return await this.calendarIntegration.deleteEvent(appointmentId)
  }
}
