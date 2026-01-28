/**
 * UpdateAppointmentHandler - Handler para atualizar agendamentos
 *
 * Baseado no UpdateEventHandler do google-calendar-mcp-main
 * Atualiza agendamento no banco e sincroniza com Google Calendar
 */

import {
  db,
  appointments,
  domainServices as sharedServices,
  updateGoogleEvent,
} from "@repo/db"
import { eq } from "drizzle-orm"

import { BaseGoogleCalendarHandler } from "./BaseGoogleCalendarHandler"

// ============================================================================
// Types
// ============================================================================

export interface UpdateAppointmentInput {
  appointmentId: string
  professionalId?: string
  serviceId?: string
  date?: string
  notes?: string
}

export interface UpdateAppointmentOutput {
  appointmentId: string
  googleSyncSuccess: boolean
  googleSyncError: string | null
  message: string
}

// ============================================================================
// Handler
// ============================================================================

const SOURCE_FILE = "packages/mcp-server/src/handlers/UpdateAppointmentHandler.ts"

export class UpdateAppointmentHandler extends BaseGoogleCalendarHandler<
  UpdateAppointmentInput,
  UpdateAppointmentOutput
> {
  constructor(salonId: string, clientPhone: string) {
    super(salonId, clientPhone, SOURCE_FILE)
  }

  async execute(input: UpdateAppointmentInput): Promise<UpdateAppointmentOutput> {
    const startTime = Date.now()

    try {
      // Validação de input
      if (!input.appointmentId?.trim()) {
        throw new Error("appointmentId é obrigatório")
      }

      // Busca agendamento existente
      const existingAppointment = await db.query.appointments.findFirst({
        where: eq(appointments.id, input.appointmentId),
        columns: { id: true, status: true, salonId: true },
      })

      if (!existingAppointment) {
        throw new Error(`Agendamento com ID ${input.appointmentId} não encontrado`)
      }

      // Verifica se o agendamento pertence ao salão correto
      if (existingAppointment.salonId !== this.salonId) {
        throw new Error("Agendamento não pertence a este salão")
      }

      // Verifica status
      if (existingAppointment.status === "cancelled") {
        throw new Error("Não é possível atualizar um agendamento cancelado")
      }

      // Normaliza a data se fornecida
      const normalizedDate = input.date
        ? this.normalizeDateTime(input.date)
        : undefined

      // Atualiza no banco
      const updateResult = await sharedServices.updateAppointmentService({
        appointmentId: input.appointmentId,
        professionalId: input.professionalId,
        serviceId: input.serviceId,
        date: normalizedDate,
        notes: input.notes,
      })

      if (!updateResult.success) {
        throw new Error(updateResult.error)
      }

      // Sincroniza com Google Calendar
      let googleSyncSuccess = false
      let googleSyncError: string | null = null

      try {
        await updateGoogleEvent(input.appointmentId)
        googleSyncSuccess = true
      } catch (error: unknown) {
        googleSyncError =
          error instanceof Error
            ? error.message
            : "Erro ao sincronizar com Google Calendar"

        this.logError("Erro ao sincronizar atualização com Google Calendar", {
          error: googleSyncError,
          appointmentId: input.appointmentId,
        })
      }

      // Monta mensagem de sucesso
      const googleNote = googleSyncSuccess
        ? " (sincronizado com Google Calendar)"
        : ""
      const message = `Agendamento atualizado com sucesso${googleNote}`

      const result: UpdateAppointmentOutput = {
        appointmentId: input.appointmentId,
        googleSyncSuccess,
        googleSyncError,
        message,
      }

      this.logExecution("google_updateAppointment", input, result, startTime)
      return result
    } catch (error) {
      this.logError("Erro ao atualizar agendamento", error)
      this.handleGoogleApiError(error, "updateAppointment")
    }
  }
}
