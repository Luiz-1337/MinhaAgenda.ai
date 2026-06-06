import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { AppointmentNotFoundError, PastAppointmentError } from "../../../domain/errors"
import { IAppointmentRepository } from "../../../domain/repositories"
import { mapServiceError } from "./appointment-error.mapper"
import { domainServices } from "@repo/db"

export interface DeleteAppointmentResult {
  appointmentId: string
  message: string
}

/**
 * DeleteAppointmentUseCase
 *
 * Cancelar = HARD delete. Delega ao serviço centralizado deleteAppointmentService
 * (@repo/db), igual a create/update, eliminando a divergência de antes. Esse serviço:
 *  - remove o agendamento do banco (não apenas marca como cancelado)
 *  - sincroniza a remoção com Google Calendar / Trinks (fire-and-forget)
 *  - dispara o preenchimento da vaga liberada (slot-filler)
 *
 * Guard local: bloqueia o cancelamento de um agendamento passado.
 */
export class DeleteAppointmentUseCase {
  constructor(private appointmentRepo: IAppointmentRepository) {}

  async execute(
    appointmentId: string,
    salonId: string
  ): Promise<Result<DeleteAppointmentResult, DomainError>> {
    const appointment = await this.appointmentRepo.findById(appointmentId)
    // Isolamento multi-tenant (bug C1): só prossegue se o agendamento pertencer
    // ao salão do contexto. "De outro salão" é tratado como "não encontrado".
    if (!appointment || appointment.salonId !== salonId) {
      return fail(new AppointmentNotFoundError(appointmentId))
    }
    if (appointment.isPast()) {
      return fail(new PastAppointmentError("Não é possível cancelar um agendamento passado"))
    }

    const result = await domainServices.deleteAppointmentService({ appointmentId, salonId })
    if (!result.success) {
      // Mapeia o código do serviço para o erro de domínio correto (bug A2).
      return fail(mapServiceError(result.code, result.error))
    }

    return ok({
      appointmentId,
      message: "Agendamento cancelado com sucesso",
    })
  }
}
