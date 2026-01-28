/**
 * Google Calendar Service - Service Facade Pattern
 * 
 * Este serviço centraliza toda a lógica de integração com o Google Calendar.
 * Substitui a arquitetura anterior de Repository -> Integration -> UseCase
 * por um único serviço simplificado com retry automático.
 */

import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library'
import { eq } from 'drizzle-orm'

import { db, appointments, professionals, services, profiles, salonIntegrations, salons } from '../index'
import { logger as defaultLogger, type ILogger } from '../infrastructure/logger'
import { GOOGLE_TIMEZONE_DEFAULT, TOKEN_REFRESH_MARGIN_MS, GOOGLE_EVENT_REMINDERS } from '../domain/constants'

// ============================================================================
// Types & Errors
// ============================================================================

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly originalError?: unknown
  ) {
    super(`[GoogleCalendar] ${message}`)
    this.name = 'GoogleCalendarError'
  }

  /**
   * Verifica se o erro indica token expirado/revogado
   */
  static isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const e = error as Record<string, unknown>
    const code = e.code ?? (e.response as Record<string, unknown>)?.status
    return code === 401
  }

  /**
   * Verifica se o erro é recuperável (vale tentar retry)
   */
  static isRetryable(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const e = error as Record<string, unknown>
    const code = e.code ?? (e.response as Record<string, unknown>)?.status
    // 429 = rate limit, 500/502/503/504 = server errors
    return code === 429 || code === 500 || code === 502 || code === 503 || code === 504
  }

  /**
   * Verifica se é erro de invalid_grant (token revogado)
   */
  static isInvalidGrant(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const e = error as Record<string, unknown>
    const responseData = (e.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined
    return (
      responseData?.error === 'invalid_grant' ||
      String(e.message || '').includes('invalid_grant')
    )
  }
}

export interface CalendarEventResult {
  eventId: string
  htmlLink?: string
}

interface AppointmentData {
  id: string
  salonId: string
  professionalId: string
  date: Date
  endTime: Date
  googleEventId: string | null
  notes: string | null
  professionalName: string
  professionalEmail: string | null
  professionalGoogleCalendarId: string | null
  serviceName: string
  clientName: string
}

// ============================================================================
// Google Calendar Service (Singleton)
// ============================================================================

export class GoogleCalendarService {
  private static instance: GoogleCalendarService
  private readonly logger: ILogger

  private constructor(logger?: ILogger) {
    this.logger = logger ?? defaultLogger
  }

  /**
   * Obtém a instância singleton do serviço
   */
  static getInstance(logger?: ILogger): GoogleCalendarService {
    if (!GoogleCalendarService.instance) {
      GoogleCalendarService.instance = new GoogleCalendarService(logger)
    }
    return GoogleCalendarService.instance
  }

  /**
   * Reset da instância (útil para testes)
   */
  static resetInstance(): void {
    GoogleCalendarService.instance = undefined as unknown as GoogleCalendarService
  }

  // ==========================================================================
  // OAuth2 Client
  // ==========================================================================

  /**
   * Obtém um cliente OAuth2 autenticado para o salão
   * Faz refresh do token automaticamente se necessário
   */
  private async getAuthClient(salonId: string): Promise<{
    client: OAuth2Client
    email: string | null
  } | null> {
    const integration = await db.query.salonIntegrations.findFirst({
      where: eq(salonIntegrations.salonId, salonId),
    })

    if (!integration || !integration.refreshToken || integration.isActive === false) {
      this.logger.debug('Integration not found or inactive', { salonId })
      return null
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.NEXT_PUBLIC_APP_URL

    if (!clientId || !clientSecret) {
      this.logger.error('GOOGLE_CLIENT_ID/SECRET not configured')
      return null
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri)

    oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken || undefined,
      expiry_date: integration.expiresAt ? integration.expiresAt * 1000 : undefined,
    })

    // Verifica se precisa refresh
    const now = Date.now()
    const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0
    const needsRefresh = !integration.accessToken || (expiresAt && expiresAt - now < TOKEN_REFRESH_MARGIN_MS)

    if (needsRefresh) {
      try {
        this.logger.debug('Refreshing OAuth2 token', { salonId })

        oauth2Client.setCredentials({ refresh_token: integration.refreshToken })
        const { credentials } = await oauth2Client.refreshAccessToken()

        await db
          .update(salonIntegrations)
          .set({
            accessToken: credentials.access_token || null,
            expiresAt: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
            updatedAt: new Date(),
          })
          .where(eq(salonIntegrations.id, integration.id))

        oauth2Client.setCredentials({
          refresh_token: credentials.refresh_token || integration.refreshToken,
          access_token: credentials.access_token || undefined,
          expiry_date: credentials.expiry_date || undefined,
        })

        this.logger.info('Token refreshed successfully', { salonId })
      } catch (error) {
        if (GoogleCalendarError.isInvalidGrant(error)) {
          this.logger.warn('Invalid grant - removing integration', { salonId })
          await db.delete(salonIntegrations).where(eq(salonIntegrations.id, integration.id))
          return null
        }
        throw new GoogleCalendarError('Failed to refresh OAuth2 token', undefined, error)
      }
    }

    return { client: oauth2Client, email: integration.email || null }
  }

  // ==========================================================================
  // Retry Logic
  // ==========================================================================

  /**
   * Executa uma operação com retry e backoff exponencial
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: unknown

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        if (!GoogleCalendarError.isRetryable(error) || attempt === maxRetries) {
          throw error
        }

        const delayMs = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
        this.logger.warn(`Retry ${attempt}/${maxRetries} for ${context} in ${delayMs}ms`, {
          error: error instanceof Error ? error.message : String(error),
        })
        await this.sleep(delayMs)
      }
    }

    throw lastError
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Verifica se o salão tem plano Solo
   */
  private async isSoloPlan(salonId: string): Promise<boolean> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })
    if (!salon?.ownerId) return false

    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, salon.ownerId),
      columns: { tier: true },
    })
    return ownerProfile?.tier === 'SOLO'
  }

  /**
   * Verifica se é email do Gmail
   */
  private isGmail(email: string | null | undefined): boolean {
    return /^[^@]+@(gmail|googlemail)\.com$/i.test(email ?? '')
  }

  /**
   * Busca dados do appointment com relações
   */
  private async getAppointmentData(appointmentId: string): Promise<AppointmentData | null> {
    const result = await db
      .select({
        id: appointments.id,
        salonId: appointments.salonId,
        professionalId: appointments.professionalId,
        date: appointments.date,
        endTime: appointments.endTime,
        googleEventId: appointments.googleEventId,
        notes: appointments.notes,
        professionalName: professionals.name,
        professionalEmail: professionals.email,
        professionalGoogleCalendarId: professionals.googleCalendarId,
        serviceName: services.name,
        clientName: profiles.fullName,
      })
      .from(appointments)
      .innerJoin(professionals, eq(appointments.professionalId, professionals.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(profiles, eq(appointments.clientId, profiles.id))
      .where(eq(appointments.id, appointmentId))
      .limit(1)

    const appt = result[0]
    if (!appt) return null

    return {
      ...appt,
      professionalEmail: appt.professionalEmail ?? null,
      professionalGoogleCalendarId: appt.professionalGoogleCalendarId ?? null,
      clientName: appt.clientName ?? '',
    }
  }

  /**
   * Resolve o calendarId para um appointment
   */
  private async resolveCalendarId(
    appointment: AppointmentData,
    authClient: { client: OAuth2Client; email: string | null },
    isSolo: boolean
  ): Promise<string | null> {
    // SOLO: calendário primário do dono
    if (isSolo) {
      return authClient.email
    }

    // PRO: calendário secundário do profissional ou Gmail do profissional
    if (appointment.professionalGoogleCalendarId) {
      return appointment.professionalGoogleCalendarId
    }

    if (appointment.professionalEmail && this.isGmail(appointment.professionalEmail)) {
      return appointment.professionalEmail
    }

    // Fallback: criar calendário secundário
    return this.createSecondaryCalendar(
      appointment.professionalId,
      appointment.professionalName,
      appointment.salonId,
      authClient
    )
  }

  /**
   * Cria um calendário secundário para o profissional
   */
  private async createSecondaryCalendar(
    professionalId: string,
    professionalName: string,
    salonId: string,
    authClient: { client: OAuth2Client; email: string | null }
  ): Promise<string | null> {
    const calendar = google.calendar({ version: 'v3', auth: authClient.client })
    const timeZone = process.env.GOOGLE_TIMEZONE || GOOGLE_TIMEZONE_DEFAULT

    try {
      const response = await calendar.calendars.insert({
        requestBody: {
          summary: `Agenda - ${professionalName}`,
          description: `Calendário de agendamentos do profissional ${professionalName}`,
          timeZone,
        },
      })

      const calendarId = response.data.id
      if (!calendarId) {
        throw new GoogleCalendarError('Calendar created but ID not returned')
      }

      // Salva o calendarId no profissional
      await db
        .update(professionals)
        .set({ googleCalendarId: calendarId })
        .where(eq(professionals.id, professionalId))

      this.logger.info('Secondary calendar created', { professionalId, calendarId })
      return calendarId
    } catch (error) {
      this.logger.error('Failed to create secondary calendar', { professionalId, error })
      throw new GoogleCalendarError('Failed to create secondary calendar', undefined, error)
    }
  }

  /**
   * Monta o payload do evento do Google Calendar
   */
  private buildEventPayload(appointment: AppointmentData): calendar_v3.Schema$Event {
    const timeZone = process.env.GOOGLE_TIMEZONE || GOOGLE_TIMEZONE_DEFAULT

    const attendees: calendar_v3.Schema$EventAttendee[] = []
    if (appointment.professionalEmail) {
      attendees.push({ email: appointment.professionalEmail })
    }

    return {
      summary: `${appointment.clientName} - ${appointment.serviceName}`,
      description: [
        `Serviço: ${appointment.serviceName}`,
        `Cliente: ${appointment.clientName}`,
        appointment.notes ? `Observações: ${appointment.notes}` : null,
      ].filter(Boolean).join('\n'),
      start: {
        dateTime: appointment.date.toISOString(),
        timeZone,
      },
      end: {
        dateTime: appointment.endTime.toISOString(),
        timeZone,
      },
      attendees: attendees.length > 0 ? attendees : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          GOOGLE_EVENT_REMINDERS.email,
          GOOGLE_EVENT_REMINDERS.popup,
        ],
      },
    }
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Cria um evento no Google Calendar para um agendamento
   */
  async createEvent(appointmentId: string): Promise<CalendarEventResult | null> {
    this.logger.debug('Creating Google Calendar event', { appointmentId })

    const appointment = await this.getAppointmentData(appointmentId)
    if (!appointment) {
      throw new GoogleCalendarError(`Appointment ${appointmentId} not found`)
    }

    const authClient = await this.getAuthClient(appointment.salonId)
    if (!authClient) {
      this.logger.warn('Google client not available', { appointmentId })
      return null
    }

    const isSolo = await this.isSoloPlan(appointment.salonId)
    let calendarId = await this.resolveCalendarId(appointment, authClient, isSolo)

    if (!calendarId) {
      this.logger.warn('Could not resolve calendarId', { appointmentId })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient.client })
    const eventPayload = this.buildEventPayload(appointment)

    try {
      const response = await this.withRetry(
        async () => calendar.events.insert({
          calendarId: calendarId!,
          requestBody: eventPayload,
        }),
        `createEvent(${appointmentId})`
      )

      const eventId = response.data.id
      if (!eventId) {
        throw new GoogleCalendarError('Event created but ID not returned')
      }

      // Salva o eventId no agendamento
      await db
        .update(appointments)
        .set({ googleEventId: eventId })
        .where(eq(appointments.id, appointmentId))

      this.logger.info('Event created successfully', {
        appointmentId,
        eventId,
        htmlLink: response.data.htmlLink,
      })

      return {
        eventId,
        htmlLink: response.data.htmlLink || undefined,
      }
    } catch (error) {
      // Fallback: se falhou com 403/404 no Gmail do profissional, tenta criar calendário secundário
      const errorObj = error as { code?: number; response?: { status?: number } }
      const status = errorObj?.code ?? errorObj?.response?.status

      if ((status === 403 || status === 404) && !isSolo && this.isGmail(calendarId)) {
        this.logger.info('Insert failed on Gmail, falling back to secondary calendar', { appointmentId })

        calendarId = await this.createSecondaryCalendar(
          appointment.professionalId,
          appointment.professionalName,
          appointment.salonId,
          authClient
        )

        if (calendarId) {
          const fallbackResponse = await calendar.events.insert({
            calendarId,
            requestBody: eventPayload,
          })

          const eventId = fallbackResponse.data.id
          if (eventId) {
            await db
              .update(appointments)
              .set({ googleEventId: eventId })
              .where(eq(appointments.id, appointmentId))

            return {
              eventId,
              htmlLink: fallbackResponse.data.htmlLink || undefined,
            }
          }
        }
      }

      this.logger.error('Failed to create event', { appointmentId, error })
      throw new GoogleCalendarError('Failed to create event', undefined, error)
    }
  }

  /**
   * Atualiza um evento no Google Calendar
   * Se o evento não existir, cria um novo
   */
  async updateEvent(appointmentId: string): Promise<CalendarEventResult | null> {
    this.logger.debug('Updating Google Calendar event', { appointmentId })

    const appointment = await this.getAppointmentData(appointmentId)
    if (!appointment) {
      throw new GoogleCalendarError(`Appointment ${appointmentId} not found`)
    }

    // Se não tem eventId, cria um novo
    if (!appointment.googleEventId) {
      this.logger.info('No googleEventId, creating new event', { appointmentId })
      return this.createEvent(appointmentId)
    }

    const authClient = await this.getAuthClient(appointment.salonId)
    if (!authClient) {
      this.logger.warn('Google client not available', { appointmentId })
      return null
    }

    const isSolo = await this.isSoloPlan(appointment.salonId)
    const calendarId = await this.resolveCalendarId(appointment, authClient, isSolo)

    if (!calendarId) {
      this.logger.warn('Could not resolve calendarId', { appointmentId })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient.client })
    const eventPayload = this.buildEventPayload(appointment)

    try {
      const response = await this.withRetry(
        async () => calendar.events.update({
          calendarId,
          eventId: appointment.googleEventId!,
          requestBody: eventPayload,
        }),
        `updateEvent(${appointmentId})`
      )

      const eventId = response.data.id
      if (!eventId) {
        throw new GoogleCalendarError('Event updated but ID not returned')
      }

      this.logger.info('Event updated successfully', { appointmentId, eventId })

      return {
        eventId,
        htmlLink: response.data.htmlLink || undefined,
      }
    } catch (error) {
      const errorObj = error as { code?: number }
      if (errorObj.code === 404) {
        // Evento não existe mais, cria um novo
        this.logger.info('Event not found, creating new', { appointmentId })
        await db
          .update(appointments)
          .set({ googleEventId: null })
          .where(eq(appointments.id, appointmentId))
        return this.createEvent(appointmentId)
      }

      this.logger.error('Failed to update event', { appointmentId, error })
      throw new GoogleCalendarError('Failed to update event', undefined, error)
    }
  }

  /**
   * Deleta um evento do Google Calendar
   * IMPORTANTE: Deve ser chamado ANTES de deletar o appointment do banco
   */
  async deleteEvent(appointmentId: string): Promise<boolean | null> {
    this.logger.debug('Deleting Google Calendar event', { appointmentId })

    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: {
        id: true,
        salonId: true,
        professionalId: true,
        googleEventId: true,
      },
    })

    if (!appointment) {
      throw new GoogleCalendarError(`Appointment ${appointmentId} not found`)
    }

    if (!appointment.googleEventId) {
      this.logger.debug('No googleEventId, nothing to delete', { appointmentId })
      return false
    }

    const authClient = await this.getAuthClient(appointment.salonId)
    if (!authClient) {
      this.logger.warn('Google client not available', { appointmentId })
      return null
    }

    // Busca o profissional para resolver o calendarId
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, appointment.professionalId),
      columns: { email: true, googleCalendarId: true },
    })

    const isSolo = await this.isSoloPlan(appointment.salonId)
    let calendarId: string | null

    if (isSolo) {
      calendarId = authClient.email
    } else {
      calendarId = professional?.googleCalendarId ?? null
      if (!calendarId && professional?.email && this.isGmail(professional.email)) {
        calendarId = professional.email
      }
    }

    if (!calendarId) {
      this.logger.warn('Could not resolve calendarId for delete', { appointmentId })
      return null
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient.client })

    try {
      await this.withRetry(
        async () => calendar.events.delete({
          calendarId: calendarId!,
          eventId: appointment.googleEventId!,
        }),
        `deleteEvent(${appointmentId})`
      )

      await db
        .update(appointments)
        .set({ googleEventId: null })
        .where(eq(appointments.id, appointmentId))

      this.logger.info('Event deleted successfully', { appointmentId })
      return true
    } catch (error) {
      const errorObj = error as { code?: number; response?: { status?: number } }
      if (errorObj?.code === 404 || errorObj?.response?.status === 404) {
        // Evento já foi deletado
        this.logger.info('Event not found (already deleted)', { appointmentId })
        await db
          .update(appointments)
          .set({ googleEventId: null })
          .where(eq(appointments.id, appointmentId))
        return true
      }

      this.logger.error('Failed to delete event', { appointmentId, error })
      throw new GoogleCalendarError('Failed to delete event', undefined, error)
    }
  }

  /**
   * Consulta períodos ocupados (FreeBusy) de um calendário do Google
   * Retorna array de períodos { start, end } que estão ocupados
   */
  async getFreeBusy(
    salonId: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<{ start: Date; end: Date }[]> {
    this.logger.debug('Querying Google Calendar FreeBusy', { salonId, calendarId, timeMin, timeMax })

    const authClient = await this.getAuthClient(salonId)
    if (!authClient) {
      this.logger.warn('Google client not available for FreeBusy', { salonId })
      return []
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient.client })

    try {
      const response = await this.withRetry(
        async () => calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: [{ id: calendarId }],
          },
        }),
        `getFreeBusy(${calendarId})`
      )

      const busySlots = response.data.calendars?.[calendarId]?.busy || []
      
      const result = busySlots
        .filter(slot => slot.start && slot.end)
        .map(slot => ({
          start: new Date(slot.start!),
          end: new Date(slot.end!),
        }))

      this.logger.debug('FreeBusy query successful', { 
        salonId, 
        calendarId, 
        busySlotsCount: result.length 
      })

      return result
    } catch (error) {
      this.logger.error('Failed to query FreeBusy', { salonId, calendarId, error })
      throw new GoogleCalendarError('Failed to query FreeBusy', undefined, error)
    }
  }

  /**
   * Consulta períodos ocupados para um profissional específico
   * Resolve automaticamente o calendarId do profissional
   */
  async getFreeBusyForProfessional(
    salonId: string,
    professionalId: string,
    timeMin: Date,
    timeMax: Date
  ): Promise<{ start: Date; end: Date }[]> {
    const authClient = await this.getAuthClient(salonId)
    if (!authClient) {
      this.logger.warn('Google client not available for FreeBusy', { salonId })
      return []
    }

    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { id: true, name: true, email: true, googleCalendarId: true },
    })

    if (!professional) {
      this.logger.warn('Professional not found for FreeBusy', { professionalId })
      return []
    }

    const isSolo = await this.isSoloPlan(salonId)

    let calendarId: string | null

    if (isSolo) {
      calendarId = authClient.email
    } else {
      calendarId = professional.googleCalendarId ?? null
      if (!calendarId && professional.email && this.isGmail(professional.email)) {
        calendarId = professional.email
      }
    }

    if (!calendarId) {
      this.logger.warn('Could not resolve calendarId for FreeBusy', { professionalId })
      return []
    }

    return this.getFreeBusy(salonId, calendarId, timeMin, timeMax)
  }

  /**
   * Garante que um profissional tenha um calendário configurado
   */
  async ensureProfessionalCalendar(
    professionalId: string,
    salonId: string
  ): Promise<string | null> {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { id: true, name: true, email: true, googleCalendarId: true },
    })

    if (!professional) {
      throw new GoogleCalendarError(`Professional ${professionalId} not found`)
    }

    const authClient = await this.getAuthClient(salonId)
    if (!authClient) {
      return null
    }

    const isSolo = await this.isSoloPlan(salonId)

    // SOLO: calendário primário do dono
    if (isSolo) {
      return authClient.email
    }

    // PRO: calendário existente ou Gmail
    if (professional.googleCalendarId) {
      return professional.googleCalendarId
    }

    if (professional.email && this.isGmail(professional.email)) {
      return professional.email
    }

    // Cria calendário secundário
    return this.createSecondaryCalendar(
      professionalId,
      professional.name,
      salonId,
      authClient
    )
  }
}

// ============================================================================
// Exported Functions (compatibilidade com API anterior)
// ============================================================================

/**
 * Cria um evento no Google Calendar
 */
export async function createGoogleEvent(
  appointmentId: string
): Promise<CalendarEventResult | null> {
  return GoogleCalendarService.getInstance().createEvent(appointmentId)
}

/**
 * Atualiza um evento no Google Calendar
 */
export async function updateGoogleEvent(
  appointmentId: string
): Promise<CalendarEventResult | null> {
  return GoogleCalendarService.getInstance().updateEvent(appointmentId)
}

/**
 * Deleta um evento do Google Calendar
 */
export async function deleteGoogleEvent(
  appointmentId: string
): Promise<boolean | null> {
  return GoogleCalendarService.getInstance().deleteEvent(appointmentId)
}

/**
 * Garante que um profissional tenha um calendário configurado
 */
export async function ensureProfessionalCalendar(
  professionalId: string,
  salonId: string
): Promise<string | null> {
  return GoogleCalendarService.getInstance().ensureProfessionalCalendar(professionalId, salonId)
}

/**
 * Obtém o cliente OAuth2 raw (para gerar URLs de auth)
 */
export function getRawOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured')
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri)
}

/**
 * Alias para compatibilidade
 */
export const getOAuth2Client = async (salonId: string) => {
  const service = GoogleCalendarService.getInstance()
  // @ts-expect-error - accessing private method for compatibility
  return service.getAuthClient(salonId)
}

export const getSalonGoogleClient = getOAuth2Client

/**
 * Consulta períodos ocupados (FreeBusy) de um calendário
 */
export async function getGoogleFreeBusy(
  salonId: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  return GoogleCalendarService.getInstance().getFreeBusy(salonId, calendarId, timeMin, timeMax)
}

/**
 * Consulta períodos ocupados para um profissional específico
 */
export async function getGoogleFreeBusyForProfessional(
  salonId: string,
  professionalId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  return GoogleCalendarService.getInstance().getFreeBusyForProfessional(
    salonId,
    professionalId,
    timeMin,
    timeMax
  )
}
