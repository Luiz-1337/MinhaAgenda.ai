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
 * Delega ao serviço centralizado deleteAppointmentService (@repo/db), igual a
 * create/update. Esse serviço:
 *  - registra o cancelamento no banco
 *  - sincroniza a remoção com Google Calendar / Trinks (fire-and-forget), para o
 *    horário ficar livre na agenda externa
 *  - dispara o preenchimento da vaga liberada (slot-filler)
 *
 * O guard de "agendamento passado" vem do DOMÍNIO (`Appointment.cancel()`), não
 * duplicado aqui. Era a mesma regra escrita nos dois lugares, e o método do
 * domínio não tinha nenhum chamador de produção — mudar a regra num só
 * silenciosamente divergiria do outro.
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
    // A transição roda no domínio primeiro: ele é o dono da regra (não cancelar
    // passado) e é aqui que ela passa a ter um chamador de verdade. A persistência
    // continua no serviço centralizado — a entidade não é salva.
    const transition = appointment.cancel()
    if (!transition.success) {
      return fail(transition.error)
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
