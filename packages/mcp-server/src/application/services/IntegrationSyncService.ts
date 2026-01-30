/**
 * IntegrationSyncService - Centraliza a sincronização com integrações externas
 * 
 * Arquitetura:
 * 1. DB é a fonte da verdade
 * 2. Integrações são sincronizadas APÓS operação no DB
 * 3. Erros de integração NÃO revertem operações do DB
 * 4. Verificação de flags de integração antes de cada operação
 */

import { ICalendarService } from '../ports'
import { ITrinksService } from '../ports/ITrinksService'
import { IIntegrationRepository } from '../ports/IIntegrationRepository'

export interface IntegrationFlags {
  googleActive: boolean
  trinksActive: boolean
}

export interface SyncResult {
  success: boolean
  googleEventId?: string | null
  trinksEventId?: string | null
  errors: IntegrationError[]
}

export interface IntegrationError {
  provider: 'google' | 'trinks'
  message: string
  code?: string
}

export interface AppointmentSyncData {
  appointmentId: string
  salonId: string
  professionalId: string
  customerId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
  customerName?: string
  serviceName?: string
  notes?: string
  googleEventId?: string | null
  trinksEventId?: string | null
  professionalGoogleCalendarId?: string | null
}

/**
 * Serviço centralizado para sincronização com integrações externas
 * Segue o padrão: DB primeiro, integrações depois, erros isolados
 */
export class IntegrationSyncService {
  constructor(
    private readonly integrationRepo: IIntegrationRepository,
    private readonly calendarService?: ICalendarService,
    private readonly trinksService?: ITrinksService,
    private readonly logger?: { warn: (msg: string, ctx?: unknown) => void; info: (msg: string, ctx?: unknown) => void }
  ) {}

  /**
   * Verifica quais integrações estão ativas para um salão
   */
  async getActiveIntegrations(salonId: string): Promise<IntegrationFlags> {
    const [googleActive, trinksActive] = await Promise.all([
      this.integrationRepo.isGoogleActive(salonId),
      this.integrationRepo.isTrinksActive(salonId),
    ])

    return { googleActive, trinksActive }
  }

  /**
   * Sincroniza criação de agendamento com integrações ativas
   * IMPORTANTE: Deve ser chamado APÓS a persistência no DB
   */
  async syncCreate(data: AppointmentSyncData): Promise<SyncResult> {
    const errors: IntegrationError[] = []
    let googleEventId: string | null = null
    let trinksEventId: string | null = null

    const flags = await this.getActiveIntegrations(data.salonId)

    // Sincroniza com Google Calendar se ativo
    if (flags.googleActive && this.calendarService) {
      try {
        const calendarId = data.professionalGoogleCalendarId
        if (calendarId) {
          const eventId = await this.calendarService.createEvent(calendarId, {
            start: data.startsAt,
            end: data.endsAt,
            summary: `${data.serviceName || 'Serviço'} - ${data.customerName || 'Cliente'}`,
            description: data.notes,
          })
          googleEventId = eventId
          this.logger?.info('Google Calendar event created', { 
            appointmentId: data.appointmentId, 
            eventId 
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ provider: 'google', message })
        this.logger?.warn('Failed to sync with Google Calendar', { 
          appointmentId: data.appointmentId, 
          error: message 
        })
      }
    }

    // Sincroniza com Trinks se ativo
    if (flags.trinksActive && this.trinksService) {
      try {
        const result = await this.trinksService.createAppointment(data)
        trinksEventId = result?.eventId ?? null
        this.logger?.info('Trinks appointment created', { 
          appointmentId: data.appointmentId, 
          eventId: trinksEventId 
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ provider: 'trinks', message })
        this.logger?.warn('Failed to sync with Trinks', { 
          appointmentId: data.appointmentId, 
          error: message 
        })
      }
    }

    return {
      success: errors.length === 0,
      googleEventId,
      trinksEventId,
      errors,
    }
  }

  /**
   * Sincroniza atualização de agendamento com integrações ativas
   * IMPORTANTE: Deve ser chamado APÓS a persistência no DB
   */
  async syncUpdate(data: AppointmentSyncData): Promise<SyncResult> {
    const errors: IntegrationError[] = []
    let googleEventId = data.googleEventId ?? null
    let trinksEventId = data.trinksEventId ?? null

    const flags = await this.getActiveIntegrations(data.salonId)

    // Sincroniza com Google Calendar se ativo
    if (flags.googleActive && this.calendarService) {
      try {
        const calendarId = data.professionalGoogleCalendarId
        if (calendarId && data.googleEventId) {
          await this.calendarService.updateEvent(calendarId, {
            id: data.googleEventId,
            start: data.startsAt,
            end: data.endsAt,
            summary: `${data.serviceName || 'Serviço'} - ${data.customerName || 'Cliente'}`,
            description: data.notes ?? undefined,
          })
          this.logger?.info('Google Calendar event updated', { 
            appointmentId: data.appointmentId, 
            eventId: data.googleEventId 
          })
        } else if (calendarId && !data.googleEventId) {
          // Não existe evento no Google, cria um novo
          const eventId = await this.calendarService.createEvent(calendarId, {
            start: data.startsAt,
            end: data.endsAt,
            summary: `${data.serviceName || 'Serviço'} - ${data.customerName || 'Cliente'}`,
            description: data.notes,
          })
          googleEventId = eventId
          this.logger?.info('Google Calendar event created (on update)', { 
            appointmentId: data.appointmentId, 
            eventId 
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ provider: 'google', message })
        this.logger?.warn('Failed to sync update with Google Calendar', { 
          appointmentId: data.appointmentId, 
          error: message 
        })
      }
    }

    // Sincroniza com Trinks se ativo
    if (flags.trinksActive && this.trinksService) {
      try {
        if (data.trinksEventId) {
          await this.trinksService.updateAppointment(data)
          this.logger?.info('Trinks appointment updated', { 
            appointmentId: data.appointmentId, 
            eventId: data.trinksEventId 
          })
        } else {
          // Não existe no Trinks, cria novo
          const result = await this.trinksService.createAppointment(data)
          trinksEventId = result?.eventId ?? null
          this.logger?.info('Trinks appointment created (on update)', { 
            appointmentId: data.appointmentId, 
            eventId: trinksEventId 
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ provider: 'trinks', message })
        this.logger?.warn('Failed to sync update with Trinks', { 
          appointmentId: data.appointmentId, 
          error: message 
        })
      }
    }

    return {
      success: errors.length === 0,
      googleEventId,
      trinksEventId,
      errors,
    }
  }

  /**
   * Sincroniza deleção/cancelamento de agendamento com integrações ativas
   * IMPORTANTE: Deve ser chamado APÓS a persistência no DB
   */
  async syncDelete(data: Pick<AppointmentSyncData, 'appointmentId' | 'salonId' | 'googleEventId' | 'trinksEventId' | 'professionalGoogleCalendarId'>): Promise<SyncResult> {
    const errors: IntegrationError[] = []

    const flags = await this.getActiveIntegrations(data.salonId)

    // Remove do Google Calendar se ativo
    if (flags.googleActive && this.calendarService && data.googleEventId) {
      try {
        const calendarId = data.professionalGoogleCalendarId
        if (calendarId) {
          await this.calendarService.deleteEvent(calendarId, data.googleEventId)
          this.logger?.info('Google Calendar event deleted', { 
            appointmentId: data.appointmentId, 
            eventId: data.googleEventId 
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Ignora erro 404 (evento já deletado)
        if (!message.includes('404')) {
          errors.push({ provider: 'google', message })
          this.logger?.warn('Failed to delete from Google Calendar', { 
            appointmentId: data.appointmentId, 
            error: message 
          })
        }
      }
    }

    // Remove do Trinks se ativo
    if (flags.trinksActive && this.trinksService && data.trinksEventId) {
      try {
        await this.trinksService.deleteAppointment(data.appointmentId, data.trinksEventId)
        this.logger?.info('Trinks appointment deleted', { 
          appointmentId: data.appointmentId, 
          eventId: data.trinksEventId 
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push({ provider: 'trinks', message })
        this.logger?.warn('Failed to delete from Trinks', { 
          appointmentId: data.appointmentId, 
          error: message 
        })
      }
    }

    return {
      success: errors.length === 0,
      googleEventId: null,
      trinksEventId: null,
      errors,
    }
  }
}
