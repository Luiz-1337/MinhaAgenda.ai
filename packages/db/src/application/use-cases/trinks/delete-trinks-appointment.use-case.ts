import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import { DomainError } from '../../../domain/errors/domain-error'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { TrinksApiClient } from './services/trinks-api-client'
import { createSalonId } from '../../../domain/integrations/value-objects/index'

/**
 * Use case for deleting a Trinks appointment
 */
export class DeleteTrinksAppointmentUseCase {
  private readonly apiClient: TrinksApiClient

  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly logger: ILogger,
    salonId: string
  ) {
    this.apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  }

  async execute(appointmentId: AppointmentId): Promise<boolean | null> {
    this.logger.debug('Deleting Trinks appointment', { appointmentId })

    const appointment = await this.appointmentRepository.findById(appointmentId)

    if (!appointment) {
      this.logger.error('Appointment not found', { appointmentId })
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!appointment.trinksEventId) {
      this.logger.debug('Appointment has no trinksEventId, nothing to delete', { appointmentId })
      return false
    }

    if (!(await this.apiClient.isActive())) {
      this.logger.warn('Trinks integration not active for this salon', {
        appointmentId,
        salonId: appointment.salonId,
      })
      return null
    }

    try {
      this.logger.debug('Deleting appointment in Trinks', {
        trinksEventId: appointment.trinksEventId,
      })

      await this.apiClient.request(`/agendamentos/${appointment.trinksEventId}`, {
        method: 'DELETE',
      })

      await this.appointmentRepository.updateExternalEventId(appointmentId, 'trinks', null)

      this.logger.info('Appointment deleted in Trinks', { appointmentId })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isNotFound = this.isNotFoundError(errorMessage)

      if (isNotFound) {
        this.logger.info(
          'Appointment not found in Trinks (already deleted), removing reference',
          { appointmentId }
        )
        await this.appointmentRepository.updateExternalEventId(appointmentId, 'trinks', null)
        return true
      }

      this.logger.error('Failed to delete appointment in Trinks', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to delete appointment in Trinks: ${errorMessage}`, 'trinks', {
        appointmentId,
      })
    }
  }

  private isNotFoundError(errorMessage: string): boolean {
    return errorMessage.includes('404') || errorMessage.includes('não encontrado')
  }
}
