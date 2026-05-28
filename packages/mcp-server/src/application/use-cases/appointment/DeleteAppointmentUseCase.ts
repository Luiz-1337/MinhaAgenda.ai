import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { AppointmentNotFoundError, PastAppointmentError } from "../../../domain/errors"
import { IAppointmentRepository } from "../../../domain/repositories"
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
    appointmentId: string
  ): Promise<Result<DeleteAppointmentResult, DomainError>> {
    const appointment = await this.appointmentRepo.findById(appointmentId)
    if (!appointment) {
      return fail(new AppointmentNotFoundError(appointmentId))
    }
    if (appointment.isPast()) {
      return fail(new PastAppointmentError("Não é possível cancelar um agendamento passado"))
    }

    const result = await domainServices.deleteAppointmentService({ appointmentId })
    if (!result.success) {
      return fail(new AppointmentNotFoundError(result.error))
    }

    return ok({
      appointmentId,
      message: "Agendamento cancelado com sucesso",
    })
  }
}
