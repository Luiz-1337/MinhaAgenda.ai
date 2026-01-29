import { CalendarEvent } from "../../../application/ports"
import { DateRange } from "../../../domain/value-objects"
import { Appointment } from "../../../domain/entities"

/**
 * Tipo do evento do Google Calendar
 */
export interface GoogleEvent {
  id?: string | null
  summary?: string | null
  description?: string | null
  start?: {
    dateTime?: string | null
    date?: string | null
    timeZone?: string | null
  } | null
  end?: {
    dateTime?: string | null
    date?: string | null
    timeZone?: string | null
  } | null
}

/**
 * Tipo do FreeBusy do Google Calendar
 */
export interface GoogleFreeBusy {
  start?: string | null
  end?: string | null
}

/**
 * Mapper para conversão entre formato do Google Calendar e domínio
 */
export class GoogleCalendarMapper {
  /**
   * Converte evento do Google para CalendarEvent
   */
  static fromGoogleEvent(event: GoogleEvent): CalendarEvent | null {
    if (!event.id) return null

    const startDateTime = event.start?.dateTime || event.start?.date
    const endDateTime = event.end?.dateTime || event.end?.date

    if (!startDateTime || !endDateTime) return null

    return {
      id: event.id,
      start: new Date(startDateTime),
      end: new Date(endDateTime),
      summary: event.summary || "Sem título",
      description: event.description || undefined,
    }
  }

  /**
   * Converte lista de eventos do Google
   */
  static fromGoogleEventList(events: GoogleEvent[]): CalendarEvent[] {
    return events
      .map((e) => this.fromGoogleEvent(e))
      .filter((e): e is CalendarEvent => e !== null)
  }

  /**
   * Converte FreeBusy do Google para DateRange
   */
  static fromGoogleFreeBusy(freeBusy: GoogleFreeBusy): DateRange | null {
    if (!freeBusy.start || !freeBusy.end) return null

    return new DateRange(new Date(freeBusy.start), new Date(freeBusy.end))
  }

  /**
   * Converte lista de FreeBusy do Google
   */
  static fromGoogleFreeBusyList(freeBusyList: GoogleFreeBusy[]): DateRange[] {
    return freeBusyList
      .map((fb) => this.fromGoogleFreeBusy(fb))
      .filter((fb): fb is DateRange => fb !== null)
  }

  /**
   * Converte Appointment para formato do Google Calendar
   */
  static toGoogleEvent(
    appointment: Appointment,
    customerName: string,
    serviceName: string,
    timezone = "America/Sao_Paulo"
  ): Omit<GoogleEvent, "id"> {
    return {
      summary: `${serviceName} - ${customerName}`,
      description: appointment.notes || undefined,
      start: {
        dateTime: appointment.startsAt.toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: appointment.endsAt.toISOString(),
        timeZone: timezone,
      },
    }
  }

  /**
   * Converte CalendarEvent para formato do Google
   */
  static toGoogleEventFromCalendarEvent(
    event: Omit<CalendarEvent, "id">,
    timezone = "America/Sao_Paulo"
  ): Omit<GoogleEvent, "id"> {
    return {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: timezone,
      },
    }
  }
}
