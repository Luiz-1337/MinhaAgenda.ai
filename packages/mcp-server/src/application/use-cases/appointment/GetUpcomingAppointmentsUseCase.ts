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

    // Buscar dados relacionados em batch (evita N+1)
    const customerIds = [...new Set(appointments.map((a) => a.customerId))]
    const professionalIds = [...new Set(appointments.map((a) => a.professionalId))]
    const serviceIds = [...new Set(appointments.map((a) => a.serviceId))]

    const [customersList, professionalsList, servicesList] = await Promise.all([
      Promise.all(customerIds.map((id) => this.customerRepo.findById(id))),
      Promise.all(professionalIds.map((id) => this.professionalRepo.findById(id))),
      Promise.all(serviceIds.map((id) => this.serviceRepo.findById(id))),
    ])

    const customerMap = new Map(
      customersList.filter(Boolean).map((c) => [c!.id, c!])
    )
    const professionalMap = new Map(
      professionalsList.filter(Boolean).map((p) => [p!.id, p!])
    )
    const serviceMap = new Map(
      servicesList.filter(Boolean).map((s) => [s!.id, s!])
    )

    const appointmentDTOs: AppointmentDTO[] = appointments.map((appointment) => ({
      id: appointment.id,
      customerName: customerMap.get(appointment.customerId)?.name ?? "Cliente",
      customerId: appointment.customerId,
      serviceName: serviceMap.get(appointment.serviceId)?.name ?? "Serviço",
      serviceId: appointment.serviceId,
      professionalName: professionalMap.get(appointment.professionalId)?.name ?? "Profissional",
      professionalId: appointment.professionalId,
      startsAt: formatDateTime(appointment.startsAt),
      endsAt: formatDateTime(appointment.endsAt),
      startsAtISO: appointment.startsAt.toISOString(),
      endsAtISO: appointment.endsAt.toISOString(),
      status: appointment.status,
      notes: appointment.notes,
    }))

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
