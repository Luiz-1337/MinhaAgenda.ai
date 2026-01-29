import { ICalendarService, CalendarEvent } from "../../../application/ports"
import { DateRange } from "../../../domain/value-objects"
import { GoogleCalendarMapper } from "./GoogleCalendarMapper"

// Re-export do serviço existente do @repo/db
import {
  GoogleCalendarService as DbGoogleCalendarService,
  getGoogleFreeBusy,
} from "@repo/db"

/**
 * Adapter que implementa ICalendarService usando o GoogleCalendarService do @repo/db
 */
export class GoogleCalendarService implements ICalendarService {
  private salonId?: string

  constructor(salonId?: string) {
    this.salonId = salonId
  }

  setSalonId(salonId: string) {
    this.salonId = salonId
  }

  async getEvents(
    calendarId: string,
    start: Date,
    end: Date
  ): Promise<CalendarEvent[]> {
    // O serviço existente não expõe getEvents diretamente
    // Isso precisaria ser implementado no @repo/db
    // Por enquanto, retorna array vazio
    console.warn("getEvents não implementado diretamente - use getFreeBusy")
    return []
  }

  async getFreeBusy(
    calendarId: string,
    start: Date,
    end: Date
  ): Promise<DateRange[]> {
    if (!this.salonId) {
      throw new Error("salonId não configurado. Use setSalonId() primeiro.")
    }

    try {
      // Usa o método getFreeBusy do serviço existente
      const result = await getGoogleFreeBusy(
        this.salonId,
        calendarId,
        start,
        end
      )

      if (!result) return []

      // Converte o resultado para DateRange[]
      return GoogleCalendarMapper.fromGoogleFreeBusyList(
        result.map((r: { start: Date; end: Date }) => ({
          start: r.start.toISOString(),
          end: r.end.toISOString(),
        }))
      )
    } catch (error) {
      console.error("Erro ao buscar FreeBusy:", error)
      return []
    }
  }

  async createEvent(
    calendarId: string,
    event: Omit<CalendarEvent, "id">
  ): Promise<string> {
    // O serviço existente usa createEvent(appointmentId)
    // Precisaria de adaptação para aceitar evento diretamente
    // Por enquanto, lança erro indicando que deve usar o método do serviço
    throw new Error(
      "Use GoogleCalendarService.createEvent(appointmentId) do @repo/db diretamente"
    )
  }

  async updateEvent(calendarId: string, event: CalendarEvent): Promise<void> {
    // Similar ao createEvent
    throw new Error(
      "Use GoogleCalendarService.updateEvent(appointmentId) do @repo/db diretamente"
    )
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    // Similar ao createEvent
    throw new Error(
      "Use GoogleCalendarService.deleteEvent(appointmentId) do @repo/db diretamente"
    )
  }

  async isConfigured(salonId: string): Promise<boolean> {
    try {
      // Verifica se existe integração ativa
      const { db, salonIntegrations, and, eq } = await import("@repo/db")

      const integration = await db.query.salonIntegrations.findFirst({
        where: and(
          eq(salonIntegrations.salonId, salonId),
          eq(salonIntegrations.provider, "google"),
          eq(salonIntegrations.isActive, true)
        ),
      })

      return !!integration
    } catch {
      return false
    }
  }
}
