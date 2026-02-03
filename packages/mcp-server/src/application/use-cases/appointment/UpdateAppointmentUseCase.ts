import { Result, ok, fail } from "../../../shared/types"
import { formatDateTime, addMinutes } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import {
  AppointmentNotFoundError,
  PastAppointmentError,
} from "../../../domain/errors"
import {
  IAppointmentRepository,
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { AppointmentDTO, UpdateAppointmentDTO } from "../../dtos"
import { domainServices } from "@repo/db"

/**
 * UpdateAppointmentUseCase
 *
 * Arquitetura:
 * 1. Validar dados de entrada
 * 2. Delega para o serviço centralizado updateAppointmentService que:
 *    - Valida que o agendamento existe e não está cancelado
 *    - Se professionalId fornecido: valida profissional e verifica se executa o serviço
 *    - Se serviceId fornecido: valida serviço
 *    - Se date fornecido: valida horário dentro do expediente (availability)
 *    - Usa transação para evitar race conditions
 *    - Verifica conflitos de agenda
 *    - Converte timezone corretamente (Brasília → UTC)
 * 3. Retorna DTO formatado
 */
export class UpdateAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository
  ) {}

  async execute(
    input: UpdateAppointmentDTO
  ): Promise<Result<AppointmentDTO, DomainError>> {
    // 1. Buscar agendamento existente para validações iniciais
    const appointment = await this.appointmentRepo.findById(input.appointmentId)
    if (!appointment) {
      return fail(new AppointmentNotFoundError(input.appointmentId))
    }

    // 2. Verificar se pode ser modificado
    if (!appointment.canBeModified()) {
      return fail(new PastAppointmentError())
    }

    // 3. Buscar dados atuais para retornar no DTO
    const [customer, currentProfessional, currentService] = await Promise.all([
      this.customerRepo.findById(appointment.customerId),
      this.professionalRepo.findById(input.professionalId || appointment.professionalId),
      this.serviceRepo.findById(input.serviceId || appointment.serviceId),
    ])

    // 4. Delega para o serviço centralizado que executa todas as validações:
    //    - Valida que o agendamento existe e não está cancelado
    //    - Se professionalId fornecido: valida profissional e verifica se executa o serviço
    //    - Se serviceId fornecido: valida serviço
    //    - Se date fornecido: valida horário dentro do expediente (availability)
    //    - Usa transação para evitar race conditions
    //    - Verifica conflitos de agenda
    //    - Converte timezone corretamente (Brasília → UTC)
    const result = await domainServices.updateAppointmentService({
      appointmentId: input.appointmentId,
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      date: input.startsAt,
      notes: input.notes,
    })

    if (!result.success) {
      return fail(new AppointmentNotFoundError(result.error))
    }

    // 5. Calcula os horários para o DTO
    const startsAt = input.startsAt ? new Date(input.startsAt) : appointment.startsAt
    const duration = currentService?.durationMinutes ?? appointment.duration
    const endsAt = addMinutes(startsAt, duration)

    // 6. Retorna DTO formatado
    return ok({
      id: input.appointmentId,
      customerName: customer?.name ?? "Cliente",
      customerId: appointment.customerId,
      serviceName: currentService?.name ?? "Serviço",
      serviceId: input.serviceId || appointment.serviceId,
      professionalName: currentProfessional?.name ?? "Profissional",
      professionalId: input.professionalId || appointment.professionalId,
      startsAt: formatDateTime(startsAt),
      endsAt: formatDateTime(endsAt),
      startsAtISO: startsAt.toISOString(),
      endsAtISO: endsAt.toISOString(),
      status: appointment.status,
      notes: input.notes !== undefined ? input.notes : appointment.notes,
    })
  }
}
