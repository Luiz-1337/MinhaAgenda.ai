import { Result, ok, fail, isOk } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { AppointmentNotFoundError } from "../../../domain/errors"
import {
  IAppointmentRepository,
  IProfessionalRepository,
} from "../../../domain/repositories"
import { IntegrationSyncService } from "../../services/IntegrationSyncService"

export interface DeleteAppointmentResult {
  appointmentId: string
  message: string
}

/**
 * DeleteAppointmentUseCase
 * 
 * Arquitetura:
 * 1. Buscar agendamento no DB
 * 2. Cancelar no DB (soft delete via status)
 * 3. Sincronizar cancelamento com integrações ativas (Google Calendar, Trinks)
 * 4. Erros de integração NÃO revertem a operação do DB
 */
export class DeleteAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private professionalRepo: IProfessionalRepository,
    private integrationSyncService?: IntegrationSyncService
  ) {}

  async execute(
    appointmentId: string
  ): Promise<Result<DeleteAppointmentResult, DomainError>> {
    // 1. Buscar agendamento
    const appointment = await this.appointmentRepo.findById(appointmentId)
    if (!appointment) {
      return fail(new AppointmentNotFoundError(appointmentId))
    }

    // 2. Cancelar (soft delete via status)
    const result = appointment.cancel()
    if (!isOk(result)) {
      return result as Result<DeleteAppointmentResult, DomainError>
    }

    // 3. Persistir no DB (fonte da verdade)
    await this.appointmentRepo.save(appointment)

    // 4. Sincronizar cancelamento com integrações ativas (erros NÃO revertem o DB)
    if (this.integrationSyncService) {
      try {
        const professional = await this.professionalRepo.findById(appointment.professionalId)
        
        const syncResult = await this.integrationSyncService.syncDelete({
          appointmentId: appointment.id,
          salonId: appointment.salonId,
          googleEventId: appointment.googleEventId,
          trinksEventId: appointment.trinksEventId,
          professionalGoogleCalendarId: professional?.googleCalendarId,
        })

        // Limpa IDs das integrações após deleção
        if (appointment.googleEventId || appointment.trinksEventId) {
          appointment.setGoogleEventId(null)
          appointment.setTrinksEventId(null)
          await this.appointmentRepo.save(appointment)
        }

        // Log de erros de integração (não bloqueiam)
        if (syncResult.errors.length > 0) {
          console.warn("Erros de integração ao cancelar (não bloqueantes):", syncResult.errors)
        }
      } catch (error) {
        // Erro inesperado na sincronização - loga mas não reverte DB
        console.warn("Erro inesperado ao sincronizar cancelamento com integrações:", error)
      }
    }

    // 5. Retornar sucesso (sempre retorna sucesso se DB funcionou)
    return ok({
      appointmentId: appointment.id,
      message: "Agendamento cancelado com sucesso",
    })
  }
}
