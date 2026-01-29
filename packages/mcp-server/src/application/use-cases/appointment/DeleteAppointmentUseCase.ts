import { Result, ok, fail, isOk } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { AppointmentNotFoundError } from "../../../domain/errors"
import {
  IAppointmentRepository,
  IProfessionalRepository,
} from "../../../domain/repositories"
import { ICalendarService } from "../../ports"

export interface DeleteAppointmentResult {
  appointmentId: string
  message: string
}

export class DeleteAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private professionalRepo: IProfessionalRepository,
    private calendarService?: ICalendarService
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

    // 3. Persistir
    await this.appointmentRepo.save(appointment)

    // 4. Remover do calendário externo
    if (this.calendarService && appointment.googleEventId) {
      try {
        const professional = await this.professionalRepo.findById(appointment.professionalId)
        if (professional?.googleCalendarId) {
          await this.calendarService.deleteEvent(
            professional.googleCalendarId,
            appointment.googleEventId
          )
        }
      } catch (error) {
        console.warn("Erro ao remover evento do calendário:", error)
      }
    }

    return ok({
      appointmentId: appointment.id,
      message: "Agendamento cancelado com sucesso",
    })
  }
}
