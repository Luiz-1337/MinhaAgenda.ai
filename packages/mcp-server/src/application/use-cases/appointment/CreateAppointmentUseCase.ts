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
import { AppointmentDTO, CreateAppointmentDTO } from "../../dtos"
import { IntegrationSyncService } from "../../services/IntegrationSyncService"

/**
 * CreateAppointmentUseCase
 *
 * Arquitetura:
 * 1. Validar dados de entrada
 * 2. Verificar conflitos no DB (fonte da verdade)
 * 3. Criar agendamento no DB
 * 4. Sincronizar com integrações ativas (Google Calendar, Trinks)
 * 5. Erros de integração NÃO revertem a operação do DB
 */
export class CreateAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private integrationSyncService?: IntegrationSyncService
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

    // 5. Verificar conflitos no DB (fonte da verdade)
    const conflicts = await this.appointmentRepo.findConflicting(
      input.professionalId,
      startsAt,
      endsAt
    )

    if (conflicts.length > 0) {
      return fail(new AppointmentConflictError())
    }

    // 6. Criar entidade Appointment
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

    // 7. Persistir no DB (fonte da verdade)
    await this.appointmentRepo.save(appointment)

    // 8. Sincronizar com integrações ativas (erros NÃO revertem o DB)
    // if (this.integrationSyncService) {
    //   try {
    //     const syncResult = await this.integrationSyncService.syncCreate({
    //       appointmentId: appointment.id,
    //       salonId: input.salonId,
    //       professionalId: input.professionalId,
    //       customerId: input.customerId,
    //       serviceId: input.serviceId,
    //       startsAt,
    //       endsAt,
    //       customerName: customer.name,
    //       serviceName: service.name,
    //       notes: input.notes,
    //       professionalGoogleCalendarId: professional.googleCalendarId,
    //     })
    //
    //     // Atualiza IDs das integrações no agendamento
    //     if (syncResult.googleEventId) {
    //       appointment.setGoogleEventId(syncResult.googleEventId)
    //     }
    //     if (syncResult.trinksEventId) {
    //       appointment.setTrinksEventId(syncResult.trinksEventId)
    //     }
    //
    //     // Persiste os IDs das integrações
    //     if (syncResult.googleEventId || syncResult.trinksEventId) {
    //       await this.appointmentRepo.save(appointment)
    //     }
    //
    //     // Log de erros de integração (não bloqueiam)
    //     if (syncResult.errors.length > 0) {
    //       console.warn("Erros de integração (não bloqueantes):", syncResult.errors)
    //     }
    //   } catch (error) {
    //     // Erro inesperado na sincronização - loga mas não reverte DB
    //     console.warn("Erro inesperado ao sincronizar com integrações:", error)
    //   }
    // }

    // 9. Retornar DTO (sempre retorna sucesso se DB funcionou)
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
