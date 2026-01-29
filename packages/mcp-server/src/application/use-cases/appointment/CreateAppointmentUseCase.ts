import { v4 as uuidv4 } from "uuid"
import { Result, ok, fail } from "../../../shared/types"
import { formatDateTime, addMinutes } from "../../../shared/utils/date.utils"
import { Appointment } from "../../../domain/entities"
import { DomainError } from "../../../domain/errors"
import {
  AppointmentConflictError,
  SlotUnavailableError,
  ProfessionalCannotPerformServiceError,
  AppointmentNotFoundError,
} from "../../../domain/errors"
import { CustomerNotFoundError } from "../../../domain/errors"
import {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { ICalendarService } from "../../ports"
import { AppointmentDTO, CreateAppointmentDTO } from "../../dtos"

export class CreateAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private calendarService?: ICalendarService
  ) {}

  async execute(
    input: CreateAppointmentDTO
  ): Promise<Result<AppointmentDTO, DomainError>> {
    // 1. Validar que o cliente existe
    const customer = await this.customerRepo.findById(input.customerId)
    if (!customer) {
      return fail(new CustomerNotFoundError(input.customerId))
    }

    // 2. Validar que o profissional existe e faz o serviço
    const professional = await this.professionalRepo.findById(input.professionalId)
    if (!professional) {
      return fail(new AppointmentNotFoundError("Profissional não encontrado"))
    }

    if (!professional.canPerformService(input.serviceId)) {
      return fail(
        new ProfessionalCannotPerformServiceError(professional.name)
      )
    }

    // 3. Buscar duração do serviço
    const service = await this.serviceRepo.findById(input.serviceId)
    if (!service) {
      return fail(new AppointmentNotFoundError("Serviço não encontrado"))
    }

    if (!service.isBookable()) {
      return fail(new SlotUnavailableError("Serviço não está disponível para agendamento"))
    }

    // 4. Calcular horário de término
    const startsAt = new Date(input.startsAt)
    const endsAt = addMinutes(startsAt, service.durationMinutes)

    // 5. Verificar conflitos no banco
    const conflicts = await this.appointmentRepo.findConflicting(
      input.professionalId,
      startsAt,
      endsAt
    )

    if (conflicts.length > 0) {
      return fail(new AppointmentConflictError())
    }

    // 6. Verificar disponibilidade no calendário externo (se configurado)
    if (this.calendarService && professional.googleCalendarId) {
      try {
        const busyPeriods = await this.calendarService.getFreeBusy(
          professional.googleCalendarId,
          startsAt,
          endsAt
        )

        if (busyPeriods.length > 0) {
          return fail(new SlotUnavailableError("Horário ocupado no calendário do profissional"))
        }
      } catch (error) {
        // Log erro mas não falha - calendário é opcional
        console.warn("Erro ao verificar calendário:", error)
      }
    }

    // 7. Criar entidade Appointment
    const appointment = Appointment.create({
      id: uuidv4(),
      salonId: input.salonId,
      customerId: input.customerId,
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      startsAt,
      endsAt,
      status: "pending",
      notes: input.notes,
    })

    // 8. Persistir
    await this.appointmentRepo.save(appointment)

    // 9. Sincronizar com calendário externo (se configurado)
    if (this.calendarService && professional.googleCalendarId) {
      try {
        const eventId = await this.calendarService.createEvent(
          professional.googleCalendarId,
          {
            start: startsAt,
            end: endsAt,
            summary: `${service.name} - ${customer.name}`,
            description: input.notes,
          }
        )
        appointment.setGoogleEventId(eventId)
        await this.appointmentRepo.save(appointment)
      } catch (error) {
        // Log erro mas não falha - sincronização é opcional
        console.warn("Erro ao sincronizar com calendário:", error)
      }
    }

    // 10. Retornar DTO
    return ok({
      id: appointment.id,
      customerName: customer.name,
      customerId: customer.id,
      serviceName: service.name,
      serviceId: service.id,
      professionalName: professional.name,
      professionalId: professional.id,
      startsAt: formatDateTime(startsAt),
      endsAt: formatDateTime(endsAt),
      startsAtISO: startsAt.toISOString(),
      endsAtISO: endsAt.toISOString(),
      status: appointment.status,
      notes: appointment.notes,
    })
  }
}
