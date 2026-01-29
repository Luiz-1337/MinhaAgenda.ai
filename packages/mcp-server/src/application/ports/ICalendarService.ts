import { DateRange } from "../../domain/value-objects"

/**
 * Evento de calendário
 */
export interface CalendarEvent {
  id: string
  start: Date
  end: Date
  summary: string
  description?: string
}

/**
 * Interface para serviços de calendário externo
 * Abstração para qualquer provedor (Google, Outlook, etc.)
 */
export interface ICalendarService {
  /**
   * Busca eventos em um período
   */
  getEvents(calendarId: string, start: Date, end: Date): Promise<CalendarEvent[]>

  /**
   * Busca períodos ocupados (FreeBusy)
   */
  getFreeBusy(calendarId: string, start: Date, end: Date): Promise<DateRange[]>

  /**
   * Cria um evento no calendário
   */
  createEvent(
    calendarId: string,
    event: Omit<CalendarEvent, "id">
  ): Promise<string>

  /**
   * Atualiza um evento existente
   */
  updateEvent(calendarId: string, event: CalendarEvent): Promise<void>

  /**
   * Remove um evento
   */
  deleteEvent(calendarId: string, eventId: string): Promise<void>

  /**
   * Verifica se o serviço está configurado para um salão
   */
  isConfigured(salonId: string): Promise<boolean>
}
