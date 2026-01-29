import { Result, ok, fail } from "../../../shared/types"
import { formatDateTime } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import { CustomerNotFoundError } from "../../../domain/errors"
import {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { AppointmentDTO, AppointmentListDTO } from "../../dtos"

export interface GetUpcomingAppointmentsInput {
  salonId: string
  customerId?: string
  phone?: string
}

export class GetUpcomingAppointmentsUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository
  ) {}

  async execute(
    input: GetUpcomingAppointmentsInput
  ): Promise<Result<AppointmentListDTO, DomainError>> {
    let appointments

    // Buscar por customerId ou phone
    if (input.customerId) {
      appointments = await this.appointmentRepo.findUpcoming(
        input.customerId,
        input.salonId
      )
    } else if (input.phone) {
      appointments = await this.appointmentRepo.findUpcomingByPhone(
        input.phone,
        input.salonId
      )
    } else {
      return fail(new CustomerNotFoundError("customerId ou phone é obrigatório"))
    }

    // Buscar dados relacionados para cada agendamento
    const appointmentDTOs: AppointmentDTO[] = []

    for (const appointment of appointments) {
      const [customer, professional, service] = await Promise.all([
        this.customerRepo.findById(appointment.customerId),
        this.professionalRepo.findById(appointment.professionalId),
        this.serviceRepo.findById(appointment.serviceId),
      ])

      appointmentDTOs.push({
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

    const message =
      appointmentDTOs.length === 0
        ? "Não há agendamentos futuros"
        : `${appointmentDTOs.length} agendamento(s) encontrado(s)`

    return ok({
      appointments: appointmentDTOs,
      total: appointmentDTOs.length,
      message,
    })
  }
}
