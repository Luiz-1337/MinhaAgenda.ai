import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import type { EventId } from '../../../domain/integrations/value-objects/event-id'
import { DomainError } from '../../../domain/errors/domain-error'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { TrinksApiClient } from './services/trinks-api-client'
import { mapStatusToTrinks } from './services/trinks-status-mapper'
import { CreateTrinksAppointmentUseCase } from './create-trinks-appointment.use-case'
import { createEventId, createSalonId } from '../../../domain/integrations/value-objects/index'

/**
 * Result of updating a Trinks appointment
 */
export interface UpdateTrinksAppointmentResult {
  eventId: EventId
}

/**
 * Use case for updating a Trinks appointment
 * If appointment doesn't exist in Trinks, creates a new one
 */
export class UpdateTrinksAppointmentUseCase {
  private readonly apiClient: TrinksApiClient

  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly logger: ILogger,
    salonId: string,
    private readonly createUseCase: CreateTrinksAppointmentUseCase
  ) {
    this.apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  }

  async execute(appointmentId: AppointmentId): Promise<UpdateTrinksAppointmentResult | null> {
    this.logger.debug('Updating Trinks appointment', { appointmentId })

    const appointment = await this.appointmentRepository.findByIdWithRelations(appointmentId)

    if (!appointment) {
      this.logger.error('Appointment not found', { appointmentId })
      throw new DomainError(`Appointment ${appointmentId} not found`, 'APPOINTMENT_NOT_FOUND', {
        appointmentId,
      })
    }

    if (!(await this.apiClient.isActive())) {
      this.logger.warn('Trinks integration not active for this salon', {
        appointmentId,
        salonId: appointment.salonId,
      })
      return null
    }

    if (!appointment.trinksEventId) {
      this.logger.info('Appointment has no trinksEventId, creating new appointment instead', {
        appointmentId,
      })
      const createResult = await this.createUseCase.execute(appointmentId)
      if (!createResult) {
        return null
      }
      return { eventId: createResult.eventId }
    }

    try {
      const payload = this.buildPayload(appointment)

      this.logger.debug('Updating appointment in Trinks', {
        trinksEventId: appointment.trinksEventId,
        payload,
      })

      await this.apiClient.request(`/agendamentos/${appointment.trinksEventId}`, {
        method: 'PUT',
        body: payload,
      })

      this.logger.info('Appointment updated in Trinks', {
        appointmentId,
        trinksEventId: appointment.trinksEventId,
      })

      return { eventId: createEventId(appointment.trinksEventId) }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isNotFound = this.isNotFoundError(errorMessage)

      if (isNotFound) {
        this.logger.info('Appointment not found in Trinks, creating new appointment', {
          appointmentId,
        })
        await this.appointmentRepository.updateExternalEventId(appointmentId, 'trinks', null)
        const createResult = await this.createUseCase.execute(appointmentId)
        if (!createResult) {
          return null
        }
        return { eventId: createResult.eventId }
      }

      this.logger.error('Failed to update appointment in Trinks', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to update appointment in Trinks: ${errorMessage}`, 'trinks', {
        appointmentId,
      })
    }
  }

  private buildPayload(appointment: Awaited<ReturnType<IAppointmentRepository['findByIdWithRelations']>>) {
    if (!appointment) {
      throw new DomainError('Appointment is null', 'INVALID_APPOINTMENT')
    }

    return {
      data: appointment.date.toISOString().split('T')[0],
      hora: appointment.date.toISOString().split('T')[1].substring(0, 5),
      profissional_id: appointment.professionalId,
      servico_id: appointment.serviceId,
      cliente_nome: appointment.clientName || 'Cliente',
      cliente_email: appointment.clientEmail || '',
      cliente_telefone: appointment.clientPhone || '',
      observacoes: appointment.notes || '',
      status: mapStatusToTrinks(appointment.status),
    }
  }

  private isNotFoundError(errorMessage: string): boolean {
    return errorMessage.includes('404') || errorMessage.includes('não encontrado')
  }
}
