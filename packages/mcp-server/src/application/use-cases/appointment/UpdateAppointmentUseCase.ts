import { Result, ok, fail, isOk } from "../../../shared/types"
import { formatDateTime, addMinutes } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import {
  AppointmentNotFoundError,
  AppointmentConflictError,
  PastAppointmentError,
} from "../../../domain/errors"
import {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { ICalendarService } from "../../ports"
import { AppointmentDTO, UpdateAppointmentDTO } from "../../dtos"

export class UpdateAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private calendarService?: ICalendarService
  ) {}

  async execute(
    input: UpdateAppointmentDTO
  ): Promise<Result<AppointmentDTO, DomainError>> {
    // 1. Buscar agendamento existente
    const appointment = await this.appointmentRepo.findById(input.appointmentId)
    if (!appointment) {
      return fail(new AppointmentNotFoundError(input.appointmentId))
    }

    // 2. Verificar se pode ser modificado
    if (!appointment.canBeModified()) {
      return fail(new PastAppointmentError())
    }

    // 3. Se mudou profissional, validar
    let professional = await this.professionalRepo.findById(appointment.professionalId)
    if (input.professionalId && input.professionalId !== appointment.professionalId) {
      professional = await this.professionalRepo.findById(input.professionalId)
      if (!professional) {
        return fail(new AppointmentNotFoundError("Profissional não encontrado"))
      }

      const result = appointment.changeProfessional(input.professionalId)
      if (!isOk(result)) {
        return result
      }
    }

    // 4. Se mudou serviço, validar e recalcular duração
    let service = await this.serviceRepo.findById(appointment.serviceId)
    if (input.serviceId && input.serviceId !== appointment.serviceId) {
      service = await this.serviceRepo.findById(input.serviceId)
      if (!service) {
        return fail(new AppointmentNotFoundError("Serviço não encontrado"))
      }

      const result = appointment.changeService(input.serviceId, service.durationMinutes)
      if (!isOk(result)) {
        return result
      }
    }

    // 5. Se mudou data, validar e reagendar
    if (input.startsAt) {
      const newStart = new Date(input.startsAt)
      const duration = service?.durationMinutes ?? appointment.duration
      const newEnd = addMinutes(newStart, duration)

      // Verificar conflitos
      const conflicts = await this.appointmentRepo.findConflicting(
        appointment.professionalId,
        newStart,
        newEnd,
        appointment.id
      )

      if (conflicts.length > 0) {
        return fail(new AppointmentConflictError())
      }

      const result = appointment.reschedule(newStart, newEnd)
      if (!isOk(result)) {
        return result
      }
    }

    // 6. Atualizar notas se fornecidas
    if (input.notes !== undefined) {
      appointment.updateNotes(input.notes)
    }

    // 7. Persistir
    await this.appointmentRepo.save(appointment)

    // 8. Sincronizar com calendário externo
    if (this.calendarService && professional?.googleCalendarId && appointment.googleEventId) {
      try {
        const customer = await this.customerRepo.findById(appointment.customerId)
        await this.calendarService.updateEvent(professional.googleCalendarId, {
          id: appointment.googleEventId,
          start: appointment.startsAt,
          end: appointment.endsAt,
          summary: `${service?.name} - ${customer?.name}`,
          description: appointment.notes ?? undefined,
        })
      } catch (error) {
        console.warn("Erro ao sincronizar atualização com calendário:", error)
      }
    }

    // 9. Buscar dados para DTO
    const customer = await this.customerRepo.findById(appointment.customerId)

    return ok({
      id: appointment.id,
      customerName: customer?.name ?? "Cliente",
      customerId: appointment.customerId,
      serviceName: service?.name ?? "Serviço",
      serviceId: appointment.serviceId,
      professionalName: professional?.name ?? "Profissional",
      professionalId: appointment.professionalId,
      startsAt: formatDateTime(appointment.startsAt),
      endsAt: formatDateTime(appointment.endsAt),
      startsAtISO: appointment.startsAt.toISOString(),
      endsAtISO: appointment.endsAt.toISOString(),
      status: appointment.status,
      notes: appointment.notes,
    })
  }
}
