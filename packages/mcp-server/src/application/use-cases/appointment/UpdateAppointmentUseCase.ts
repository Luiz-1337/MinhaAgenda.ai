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
import { AppointmentDTO, UpdateAppointmentDTO } from "../../dtos"
import { IntegrationSyncService } from "../../services/IntegrationSyncService"

/**
 * UpdateAppointmentUseCase
 * 
 * Arquitetura:
 * 1. Validar dados de entrada
 * 2. Verificar conflitos no DB (fonte da verdade)
 * 3. Atualizar agendamento no DB
 * 4. Sincronizar com integrações ativas (Google Calendar, Trinks)
 * 5. Erros de integração NÃO revertem a operação do DB
 */
export class UpdateAppointmentUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private customerRepo: ICustomerRepository,
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private integrationSyncService?: IntegrationSyncService
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

    // 5. Se mudou data, validar e reagendar (verifica conflitos no DB)
    if (input.startsAt) {
      const newStart = new Date(input.startsAt)
      const duration = service?.durationMinutes ?? appointment.duration
      const newEnd = addMinutes(newStart, duration)

      // Verificar conflitos no DB (fonte da verdade)
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

    // 7. Persistir no DB (fonte da verdade)
    await this.appointmentRepo.save(appointment)

    // 8. Buscar dados para DTO e sincronização
    const customer = await this.customerRepo.findById(appointment.customerId)

    // 9. Sincronizar com integrações ativas (erros NÃO revertem o DB)
    if (this.integrationSyncService) {
      try {
        const syncResult = await this.integrationSyncService.syncUpdate({
          appointmentId: appointment.id,
          salonId: appointment.salonId,
          professionalId: appointment.professionalId,
          customerId: appointment.customerId,
          serviceId: appointment.serviceId,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          customerName: customer?.name,
          serviceName: service?.name,
          notes: appointment.notes ?? undefined,
          googleEventId: appointment.googleEventId,
          trinksEventId: appointment.trinksEventId,
          professionalGoogleCalendarId: professional?.googleCalendarId,
        })

        // Atualiza IDs das integrações se foram criados
        let needsSave = false
        if (syncResult.googleEventId && syncResult.googleEventId !== appointment.googleEventId) {
          appointment.setGoogleEventId(syncResult.googleEventId)
          needsSave = true
        }
        if (syncResult.trinksEventId && syncResult.trinksEventId !== appointment.trinksEventId) {
          appointment.setTrinksEventId(syncResult.trinksEventId)
          needsSave = true
        }

        if (needsSave) {
          await this.appointmentRepo.save(appointment)
        }

        // Log de erros de integração (não bloqueiam)
        if (syncResult.errors.length > 0) {
          console.warn("Erros de integração (não bloqueantes):", syncResult.errors)
        }
      } catch (error) {
        // Erro inesperado na sincronização - loga mas não reverte DB
        console.warn("Erro inesperado ao sincronizar com integrações:", error)
      }
    }

    // 10. Retornar DTO (sempre retorna sucesso se DB funcionou)
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
