import type { IAppointmentRepository } from '../../../domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { AppointmentId } from '../../../domain/integrations/value-objects/appointment-id'
import type { EventId } from '../../../domain/integrations/value-objects/event-id'
import { DomainError } from '../../../domain/errors/domain-error'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { TrinksApiClient } from './services/trinks-api-client'
import { mapStatusToTrinks } from './services/trinks-status-mapper'
import { createEventId, createSalonId } from '../../../domain/integrations/value-objects/index'

/**
 * Result of creating a Trinks appointment
 */
export interface CreateTrinksAppointmentResult {
  eventId: EventId
}

/**
 * Use case for creating a Trinks appointment
 */
export class CreateTrinksAppointmentUseCase {
  private readonly apiClient: TrinksApiClient

  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly logger: ILogger,
    salonId: string
  ) {
    this.apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  }

  async execute(appointmentId: AppointmentId): Promise<CreateTrinksAppointmentResult | null> {
    this.logger.debug('Creating Trinks appointment', { appointmentId })

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

    try {
      const payload = this.buildPayload(appointment)

      this.logger.debug('Creating appointment in Trinks', { appointmentId, payload })

      const response = await this.apiClient.request<{ id: string } | string>('/agendamentos', {
        method: 'POST',
        body: payload,
      })

      const trinksEventId = this.extractEventId(response)

      if (!trinksEventId) {
        this.logger.warn('Trinks returned appointment without ID', { appointmentId, response })
        return null
      }

      await this.appointmentRepository.updateExternalEventId(
        appointmentId,
        'trinks',
        trinksEventId
      )

      this.logger.info('Appointment created in Trinks', { appointmentId, trinksEventId })

      return { eventId: createEventId(trinksEventId) }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to create appointment in Trinks', {
        appointmentId,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to sync with Trinks: ${errorMessage}`, 'trinks', {
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

  private extractEventId(response: { id: string } | string | null): string | null {
    if (!response) {
      return null
    }

    if (typeof response === 'string') {
      return response
    }

    if (typeof response === 'object' && 'id' in response) {
      return String(response.id)
    }

    return null
  }
}
