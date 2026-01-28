/**
 * CheckAvailabilityHandler - Handler para verificar disponibilidade
 *
 * Baseado no FreeBusyEventHandler do google-calendar-mcp-main
 * Combina disponibilidade do banco com a API FreeBusy do Google Calendar
 */

import {
  db,
  services,
  domainServices as sharedServices,
  getGoogleFreeBusyForProfessional,
} from "@repo/db"
import { eq } from "drizzle-orm"

import { BaseGoogleCalendarHandler } from "./BaseGoogleCalendarHandler"

// ============================================================================
// Types
// ============================================================================

export interface CheckAvailabilityInput {
  professionalId: string
  date: string
  serviceId?: string
  serviceDuration?: number
}

export interface CheckAvailabilityOutput {
  source: "google_calendar_combined" | "database_only"
  slots: string[]
  totalAvailable: number
  googleBusySlotsCount: number
  message: string
  googleError?: string
  debug?: {
    dbSlotsCount: number
    filteredAfterGoogle: number
    googleBusySlots: { start: string; end: string }[]
  }
}

// ============================================================================
// Handler
// ============================================================================

const SOURCE_FILE = "packages/mcp-server/src/handlers/CheckAvailabilityHandler.ts"

export class CheckAvailabilityHandler extends BaseGoogleCalendarHandler<
  CheckAvailabilityInput,
  CheckAvailabilityOutput
> {
  constructor(salonId: string, clientPhone: string) {
    super(salonId, clientPhone, SOURCE_FILE)
  }

  async execute(input: CheckAvailabilityInput): Promise<CheckAvailabilityOutput> {
    const startTime = Date.now()

    try {
      // Validação de input
      if (!input.professionalId?.trim()) {
        throw new Error("professionalId é obrigatório para verificar disponibilidade")
      }

      // Normaliza a data
      const dateStr = this.normalizeDateTime(input.date)
      const dateOnly = this.extractDateOnly(dateStr)

      // Resolve a duração do serviço
      let serviceDuration = input.serviceDuration ?? 60
      if (input.serviceId && !input.serviceDuration) {
        const service = await db.query.services.findFirst({
          where: eq(services.id, input.serviceId),
          columns: { duration: true },
        })
        if (service) serviceDuration = service.duration
      }

      // Define intervalo do dia para consulta FreeBusy
      const dayStart = new Date(`${dateOnly}T00:00:00-03:00`)
      const dayEnd = new Date(`${dateOnly}T23:59:59.999-03:00`)

      // Busca slots disponíveis no banco de dados
      const dbSlots = await sharedServices.getAvailableSlots({
        date: dateStr,
        salonId: this.salonId,
        serviceDuration,
        professionalId: input.professionalId,
      })

      // Consulta Google Calendar FreeBusy
      let googleBusySlots: { start: Date; end: Date }[] = []
      let googleError: string | null = null

      try {
        googleBusySlots = await getGoogleFreeBusyForProfessional(
          this.salonId,
          input.professionalId,
          dayStart,
          dayEnd
        )
      } catch (err: unknown) {
        // Log warning mas não falha - usa apenas slots do banco
        googleError = err instanceof Error ? err.message : "Erro ao consultar Google FreeBusy"
        this.logWarning("Falha ao consultar Google FreeBusy", { error: googleError })
      }

      // Filtra slots removendo os que conflitam com busy do Google
      const filteredSlots = dbSlots.filter((slot) => {
        const slotStart = new Date(`${dateOnly}T${slot}:00-03:00`)
        const slotEnd = new Date(slotStart.getTime() + serviceDuration * 60 * 1000)

        const hasOverlap = googleBusySlots.some(
          (busy) => slotStart < busy.end && slotEnd > busy.start
        )
        return !hasOverlap
      })

      // Limita a 2 melhores slots
      const slots = filteredSlots.slice(0, 2)

      // Determina a fonte dos dados
      const source =
        googleBusySlots.length > 0 ? "google_calendar_combined" : "database_only"

      // Monta mensagem de resposta
      let message: string
      if (slots.length > 0) {
        const googleNote =
          googleBusySlots.length > 0 ? " (verificado com Google Calendar)" : ""
        message =
          slots.length === 2
            ? `Encontrados ${slots.length} horários disponíveis (mostrando os 2 melhores)${googleNote}`
            : `Encontrado ${slots.length} horário disponível${googleNote}`
      } else {
        message = "Nenhum horário disponível para esta data"
      }

      // Monta resultado
      const result: CheckAvailabilityOutput = {
        source,
        slots,
        totalAvailable: filteredSlots.length,
        googleBusySlotsCount: googleBusySlots.length,
        message,
      }

      // Adiciona erro do Google se houver
      if (googleError) {
        result.googleError = googleError
      }

      // Adiciona debug info em desenvolvimento
      if (process.env.NODE_ENV === "development") {
        result.debug = {
          dbSlotsCount: dbSlots.length,
          filteredAfterGoogle: filteredSlots.length,
          googleBusySlots: googleBusySlots.map((b) => ({
            start: b.start.toISOString(),
            end: b.end.toISOString(),
          })),
        }
      }

      this.logExecution("google_checkAvailability", input, result, startTime)
      return result
    } catch (error) {
      this.logError("Erro ao verificar disponibilidade", error)
      this.handleGoogleApiError(error, "checkAvailability")
    }
  }
}
