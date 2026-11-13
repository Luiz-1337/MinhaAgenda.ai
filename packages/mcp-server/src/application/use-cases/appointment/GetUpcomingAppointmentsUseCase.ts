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
import { lookupCustomerInAgenda } from "./agenda-customer-lookup.service"

export interface GetUpcomingAppointmentsInput {
  salonId: string
  customerId?: string
  phone?: string
  /**
   * Antes de listar, consultar a agenda oficial do salão (ex.: Belasis) e trazer
   * para cá o que a recepção marcou para esta cliente.
   *
   * Custa chamadas à API de lá (cota de 30/min), por isso é opcional: a tool
   * getMyFutureAppointments liga sempre; o bloco de agendamentos do prompt, que
   * roda a cada mensagem, só liga quando a cliente fala em remarcar ou cancelar.
   * Em salão sem agenda oficial não faz nada.
   */
  refreshFromAgenda?: boolean
  /**
   * Quanto esperar pela agenda oficial antes de seguir só com o que está aqui.
   * Quem monta o prompt usa um prazo curto: a consulta está no caminho de TODA a
   * resposta. Padrão: AGENDA_LOOKUP_TIMEOUT_MS.
   */
  agendaTimeoutMs?: number
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
    if (!input.customerId && !input.phone) {
      return fail(new CustomerNotFoundError("customerId ou phone é obrigatório"))
    }

    // Agenda oficial primeiro: o que ela trouxer já entra na busca logo abaixo.
    const officialAgenda = input.refreshFromAgenda ? await this.refreshFromAgenda(input) : undefined

    // Buscar por customerId ou phone
    const appointments = input.customerId
      ? await this.appointmentRepo.findUpcoming(input.customerId, input.salonId)
      : await this.appointmentRepo.findUpcomingByPhone(input.phone!, input.salonId)

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
      ...(officialAgenda ? { officialAgenda } : {}),
    })
  }

  /** Undefined = o salão não tem agenda oficial, ou a cliente ainda não tem cadastro aqui. */
  private async refreshFromAgenda(
    input: GetUpcomingAppointmentsInput
  ): Promise<AppointmentListDTO["officialAgenda"]> {
    const customerId =
      input.customerId ?? (await this.customerRepo.findByPhone(input.phone!, input.salonId))?.id
    if (!customerId) return undefined

    const lookup = await lookupCustomerInAgenda(input.salonId, customerId, {
      timeoutMs: input.agendaTimeoutMs,
    })
    if (lookup.status === "no_agenda") return undefined

    return {
      status: lookup.status,
      unlinked: lookup.unlinked.map((item) => ({
        startsAt: formatDateTime(item.start),
        startsAtISO: item.start.toISOString(),
      })),
    }
  }
}
