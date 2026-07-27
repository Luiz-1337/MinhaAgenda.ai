import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import {
  AppointmentNotFoundError,
  AppointmentOperationError,
} from "../../../domain/errors"
import { IAppointmentRepository } from "../../../domain/repositories"

export interface ConfirmAppointmentResult {
  appointmentId: string
  status: string
  alreadyConfirmed: boolean
  message: string
}

/**
 * ConfirmAppointmentUseCase
 *
 * Marca a presença do cliente como confirmada (status 'pending' → 'confirmed').
 *
 * Existe porque o lembrete diário pede uma confirmação e, até então, não havia
 * NADA que a atendesse: `Appointment.confirm()` estava implementado e testado no
 * domínio, mas nenhum caminho de produção o chamava. O cliente respondia e o
 * agendamento ficava 'pending' para sempre.
 *
 * Diferente de create/update/delete, isto NÃO passa pelos serviços centralizados
 * de @repo/db: é só uma transição de estado, sem realocar horário, sem tocar em
 * disponibilidade e sem sincronizar com Google/Trinks.
 */
export class ConfirmAppointmentUseCase {
  constructor(private appointmentRepo: IAppointmentRepository) {}

  async execute(
    appointmentId: string,
    salonId: string
  ): Promise<Result<ConfirmAppointmentResult, DomainError>> {
    const appointment = await this.appointmentRepo.findById(appointmentId)
    // Isolamento multi-tenant (bug C1): "de outro salão" é tratado como
    // "não encontrado", igual a update/delete.
    if (!appointment || appointment.salonId !== salonId) {
      return fail(new AppointmentNotFoundError(appointmentId))
    }

    // Idempotente: confirmar duas vezes não é erro. O cliente pode responder
    // o lembrete mais de uma vez.
    if (appointment.status === "confirmed") {
      return ok({
        appointmentId,
        status: "confirmed",
        alreadyConfirmed: true,
        message: "Este agendamento já estava confirmado",
      })
    }

    if (appointment.status === "cancelled") {
      return fail(
        new AppointmentOperationError(
          "Não é possível confirmar um agendamento cancelado"
        )
      )
    }

    if (appointment.status === "completed") {
      return fail(
        new AppointmentOperationError(
          "Não é possível confirmar um agendamento já concluído"
        )
      )
    }

    // Guard de passado vive no domínio (Appointment.confirm()).
    const confirmed = appointment.confirm()
    if (!confirmed.success) {
      return fail(confirmed.error)
    }

    await this.appointmentRepo.save(appointment)

    return ok({
      appointmentId,
      status: appointment.status,
      alreadyConfirmed: false,
      message: "Presença confirmada com sucesso",
    })
  }
}
