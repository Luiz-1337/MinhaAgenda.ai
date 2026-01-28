/**
 * DeleteAppointmentHandler - Handler para deletar agendamentos
 *
 * Baseado no DeleteEventHandler do google-calendar-mcp-main
 * Remove agendamento do banco e deleta evento do Google Calendar
 *
 * IMPORTANTE: Deleta do Google Calendar ANTES de deletar do banco
 * para garantir que temos os dados necessários para a sincronização
 */

import {
  db,
  appointments,
  domainServices as sharedServices,
  deleteGoogleEvent,
} from "@repo/db"
import { eq } from "drizzle-orm"

import { BaseGoogleCalendarHandler } from "./BaseGoogleCalendarHandler"

// ============================================================================
// Types
// ============================================================================

export interface DeleteAppointmentInput {
  appointmentId: string
}

export interface DeleteAppointmentOutput {
  googleSyncSuccess: boolean
  googleSyncError: string | null
  message: string
}

// ============================================================================
// Handler
// ============================================================================

const SOURCE_FILE = "packages/mcp-server/src/handlers/DeleteAppointmentHandler.ts"

export class DeleteAppointmentHandler extends BaseGoogleCalendarHandler<
  DeleteAppointmentInput,
  DeleteAppointmentOutput
> {
  constructor(salonId: string, clientPhone: string) {
    super(salonId, clientPhone, SOURCE_FILE)
  }

  async execute(input: DeleteAppointmentInput): Promise<DeleteAppointmentOutput> {
    const startTime = Date.now()

    try {
      // Validação de input
      if (!input.appointmentId?.trim()) {
        throw new Error("appointmentId é obrigatório")
      }

      // Busca dados do agendamento ANTES de deletar
      const existingAppointment = await db.query.appointments.findFirst({
        where: eq(appointments.id, input.appointmentId),
        columns: { id: true, salonId: true, googleEventId: true },
      })

      if (!existingAppointment) {
        throw new Error(`Agendamento com ID ${input.appointmentId} não encontrado`)
      }

      // Verifica se o agendamento pertence ao salão correto
      if (existingAppointment.salonId !== this.salonId) {
        throw new Error("Agendamento não pertence a este salão")
      }

      // Sincroniza deleção com Google Calendar ANTES de deletar no banco
      // Isso é importante porque precisamos dos dados do appointment para a sincronização
      let googleSyncSuccess = false
      let googleSyncError: string | null = null

      if (existingAppointment.googleEventId) {
        try {
          await deleteGoogleEvent(input.appointmentId)
          googleSyncSuccess = true
        } catch (error: unknown) {
          googleSyncError =
            error instanceof Error
              ? error.message
              : "Erro ao sincronizar com Google Calendar"

          this.logError("Erro ao sincronizar deleção com Google Calendar", {
            error: googleSyncError,
            appointmentId: input.appointmentId,
          })
        }
      }

      // Deleta do banco
      const deleteResult = await sharedServices.deleteAppointmentService({
        appointmentId: input.appointmentId,
      })

      if (!deleteResult.success) {
        throw new Error(deleteResult.error)
      }

      // Determina sucesso da sincronização com Google
      // Se não tinha evento no Google, considera sucesso
      const hadGoogleEvent = !!existingAppointment.googleEventId
      const finalGoogleSyncSuccess = hadGoogleEvent ? googleSyncSuccess : true

      // Monta mensagem de sucesso
      const googleNote =
        finalGoogleSyncSuccess || !hadGoogleEvent
          ? " (removido do Google Calendar)"
          : ""
      const message = `Agendamento removido com sucesso${googleNote}`

      const result: DeleteAppointmentOutput = {
        googleSyncSuccess: finalGoogleSyncSuccess,
        googleSyncError,
        message,
      }

      this.logExecution("google_deleteAppointment", input, result, startTime)
      return result
    } catch (error) {
      this.logError("Erro ao deletar agendamento", error)
      this.handleGoogleApiError(error, "deleteAppointment")
    }
  }
}
