/**
 * CreateAppointmentHandler - Handler para criar agendamentos
 *
 * Baseado no CreateEventHandler do google-calendar-mcp-main
 * Cria agendamento no banco e sincroniza com Google Calendar
 */

import {
  db,
  services,
  professionals,
  profiles,
  domainServices as sharedServices,
  createGoogleEvent,
} from "@repo/db"
import { eq } from "drizzle-orm"

import { BaseGoogleCalendarHandler } from "./BaseGoogleCalendarHandler"

// ============================================================================
// Types
// ============================================================================

export interface CreateAppointmentInput {
  professionalId: string
  serviceId: string
  date: string
  notes?: string
}

export interface CreateAppointmentOutput {
  appointmentId: string
  googleEventId: string | null
  googleSyncSuccess: boolean
  googleSyncError: string | null
  message: string
}

// ============================================================================
// Handler
// ============================================================================

const SOURCE_FILE = "packages/mcp-server/src/handlers/CreateAppointmentHandler.ts"

export class CreateAppointmentHandler extends BaseGoogleCalendarHandler<
  CreateAppointmentInput,
  CreateAppointmentOutput
> {
  constructor(salonId: string, clientPhone: string) {
    super(salonId, clientPhone, SOURCE_FILE)
  }

  async execute(input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
    const startTime = Date.now()

    try {
      // Validação de inputs
      if (!input.professionalId?.trim()) {
        throw new Error("professionalId é obrigatório")
      }
      if (!input.serviceId?.trim()) {
        throw new Error("serviceId é obrigatório")
      }
      if (!input.date?.trim()) {
        throw new Error("date é obrigatório")
      }

      // Busca cliente pelo telefone
      const client = await db.query.profiles.findFirst({
        where: eq(profiles.phone, this.clientPhone),
        columns: { id: true, fullName: true },
      })

      if (!client) {
        throw new Error(
          `Cliente com telefone ${this.clientPhone} não encontrado. ` +
            "Por favor, identifique o cliente primeiro."
        )
      }

      // Normaliza a data
      const normalizedDate = this.normalizeDateTime(input.date)

      // Cria agendamento no banco usando serviço centralizado
      const createResult = await sharedServices.createAppointmentService({
        salonId: this.salonId,
        professionalId: input.professionalId,
        clientId: client.id,
        serviceId: input.serviceId,
        date: normalizedDate,
        notes: input.notes,
      })

      if (!createResult.success) {
        throw new Error(createResult.error)
      }

      const appointmentId = createResult.data.appointmentId

      // Sincroniza com Google Calendar
      let googleEventId: string | null = null
      let googleSyncError: string | null = null

      try {
        const googleResult = await createGoogleEvent(appointmentId)
        if (googleResult) {
          googleEventId = googleResult.eventId
        }
      } catch (error: unknown) {
        googleSyncError =
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar com Google Calendar"

        this.logError("Erro ao sincronizar criação com Google Calendar", {
          error: googleSyncError,
          appointmentId,
        })
      }

      // Busca info do profissional e serviço para a mensagem
      const [professional, service] = await Promise.all([
        db.query.professionals.findFirst({
          where: eq(professionals.id, input.professionalId),
          columns: { name: true },
        }),
        db.query.services.findFirst({
          where: eq(services.id, input.serviceId),
          columns: { name: true },
        }),
      ])

      // Formata data para exibição
      const dateObj = this.parseDateTime(normalizedDate)
      const formattedDate = dateObj.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      })

      // Monta mensagem de sucesso
      const googleNote = googleEventId ? " (sincronizado com Google Calendar)" : ""
      const message =
        `Agendamento criado com sucesso para ${client.fullName || "cliente"} ` +
        `com ${professional?.name || "profissional"} ` +
        `às ${formattedDate}${googleNote}`

      const result: CreateAppointmentOutput = {
        appointmentId,
        googleEventId,
        googleSyncSuccess: !!googleEventId,
        googleSyncError,
        message,
      }

      this.logExecution("google_createAppointment", input, result, startTime)
      return result
    } catch (error) {
      this.logError("Erro ao criar agendamento", error)
      this.handleGoogleApiError(error, "createAppointment")
    }
  }
}
