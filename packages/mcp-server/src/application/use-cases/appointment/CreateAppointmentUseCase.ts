import { Result, ok, fail } from "../../../shared/types"
import { formatDateTime } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import { CustomerNotFoundError, AppointmentNotFoundError } from "../../../domain/errors"
import {
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { AppointmentDTO, CreateAppointmentDTO } from "../../dtos"
import { domainServices } from "@repo/db"

/**
 * CreateAppointmentUseCase
 *
 * Arquitetura:
 * 1. Validar dados de entrada
 * 2. Delega para o serviço centralizado createAppointmentService que:
 *    - Valida serviço e profissional
 *    - Verifica se profissional executa o serviço
 *    - Valida horário dentro do expediente (availability)
 *    - Usa transação para evitar race conditions
 *    - Verifica conflitos de agenda
 *    - Converte timezone corretamente (Brasília → UTC)
 * 3. Retorna DTO formatado
 */
export class CreateAppointmentUseCase {
  constructor(
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository
  ) {}

  async execute(
    input: CreateAppointmentDTO
  ): Promise<Result<AppointmentDTO, DomainError>> {
    // 1. Validar que o cliente existe
    const customer = await this.customerRepo.findById(input.customerId)
    if (!customer) {
      return fail(new CustomerNotFoundError(input.customerId))
    }

    // 2. Validar que o profissional existe
    const professional = await this.professionalRepo.findById(input.professionalId)
    if (!professional) {
      return fail(new AppointmentNotFoundError("Profissional não encontrado"))
    }

    // 3. Validar que o serviço existe
    const service = await this.serviceRepo.findById(input.serviceId)
    if (!service) {
      return fail(new AppointmentNotFoundError("Serviço não encontrado"))
    }

    // 4. Delega para o serviço centralizado que executa todas as validações:
    //    - Verifica se profissional executa o serviço
    //    - Valida horário dentro do expediente (availability)
    //    - Usa transação para evitar race conditions
    //    - Verifica conflitos de agenda
    //    - Converte timezone corretamente (Brasília → UTC)
    const result = await domainServices.createAppointmentService({
      salonId: input.salonId,
      professionalId: input.professionalId,
      clientId: input.customerId,
      serviceId: input.serviceId,
      date: input.startsAt,
      notes: input.notes,
    })

    if (!result.success) {
      return fail(new AppointmentNotFoundError(result.error))
    }

    // 5. Busca o agendamento criado para calcular endTime
    const startsAt = new Date(input.startsAt)
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60 * 1000)

    // 6. Retorna DTO formatado
    return ok({
      id: result.data.appointmentId,
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
      status: "pending",
      notes: input.notes,
    })
  }
}
