import { Result, ok, fail } from "../../../shared/types"
import { formatDateTime } from "../../../shared/utils/date.utils"
import { DomainError } from "../../../domain/errors"
import {
  CustomerNotFoundError,
  AppointmentCreationError,
  ExistingAppointmentFoundError,
} from "../../../domain/errors"
import {
  ICustomerRepository,
  IProfessionalRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { AppointmentDTO, CreateAppointmentDTO } from "../../dtos"
import { mapKnownServiceError } from "./appointment-error.mapper"
import { checkCustomerNameForAgenda } from "./agenda-customer-name.service"
import { lookupCustomerInAgenda, type AgendaCustomerLookup } from "./agenda-customer-lookup.service"
import { domainServices } from "@repo/db"

/**
 * CreateAppointmentUseCase
 *
 * Arquitetura:
 * 1. Validar dados de entrada
 * 1b. Com agenda oficial: confere o que a cliente já tem marcado lá e se o nome
 *     dela serve para o cadastro (ver os dois serviços agenda-customer-*)
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
  ) { }

  async execute(
    input: CreateAppointmentDTO
  ): Promise<Result<AppointmentDTO, DomainError>> {
    // 1. Validar que cliente, profissional e serviço existem (em paralelo)
    const [customer, professional, service] = await Promise.all([
      this.customerRepo.findById(input.customerId, input.salonId),
      this.professionalRepo.findById(input.professionalId),
      this.serviceRepo.findById(input.serviceId),
    ])

    if (!customer) {
      return fail(new CustomerNotFoundError(input.customerId))
    }
    if (!professional) {
      return fail(new AppointmentCreationError("Profissional não encontrado"))
    }
    if (!service) {
      return fail(new AppointmentCreationError("Serviço não encontrado"))
    }

    // Agenda oficial do salão (onde a recepção também marca): antes de criar um
    // horário, o que esta cliente JÁ TEM marcado lá? O que aparecer passa a existir
    // aqui e a IA pergunta se é remarcação, em vez de criar um segundo horário e
    // deixar o original na agenda. Vem ANTES do nome de propósito: a consulta acha
    // o cadastro dela lá pelo telefone, e quem já tem cadastro não é perguntada.
    const lookup = await lookupCustomerInAgenda(input.salonId, customer.id)
    if (lookup.imported.length > 0 || lookup.newUnlinked.length > 0) {
      return fail(await this.existingAppointmentError(lookup))
    }

    // Com agenda oficial ativa, a cliente é cadastrada lá pelo nome: a IA só
    // segue com o nome que a própria cliente informou (ver o serviço).
    const nameError = await checkCustomerNameForAgenda({
      salonId: input.salonId,
      customerId: customer.id,
      customerName: customer.name,
      operation: "create",
    })
    if (nameError) {
      return fail(nameError)
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
      // Cada recusa com código leva o motivo próprio (horário ocupado, fora do
      // expediente, agenda oficial fora do ar…). Sem código sobram os dados
      // inválidos (serviço/profissional inativo, data ilegível): falha de criação.
      return fail(mapKnownServiceError(result.code, result.error) ?? new AppointmentCreationError(result.error))
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

  /**
   * O texto que a IA lê quando a cliente já tem horário na agenda do salão. Traz o
   * que foi achado (com o id interno, para remarcar) e as duas saídas. Na segunda
   * chamada de addAppointment nada disto se repete: o que veio de lá já existe
   * aqui, e o horário sem par já foi avisado.
   */
  private async existingAppointmentError(lookup: AgendaCustomerLookup): Promise<ExistingAppointmentFoundError> {
    const lines: string[] = []

    for (const found of lookup.imported) {
      const [service, professional] = await Promise.all([
        this.serviceRepo.findById(found.serviceId),
        this.professionalRepo.findById(found.professionalId),
      ])
      lines.push(
        `- ${service?.name ?? "Serviço"} com ${professional?.name ?? "o profissional"} em ` +
          `${formatDateTime(found.start)} (id interno: ${found.appointmentId})`
      )
    }
    for (const found of lookup.newUnlinked) {
      lines.push(
        `- um horário em ${formatDateTime(found.start)}, marcado pela equipe do salão, que NÃO pode ser alterado por aqui`
      )
    }

    const canMove = lookup.imported.length > 0
    const cannotMove = lookup.newUnlinked.length > 0
    return new ExistingAppointmentFoundError(
      [
        "Nada foi agendado. A cliente já tem horário marcado na agenda do salão que você ainda não conhecia:",
        ...lines,
        "Antes de criar outro, pergunte se ela quer REMARCAR esse horário ou se quer um horário A MAIS.",
        ...(canMove
          ? ["- Remarcar: use updateAppointment com o id interno acima. NÃO crie um agendamento novo para isso."]
          : []),
        ...(cannotMove
          ? ["- Mexer no horário marcado pela equipe: avise a equipe do salão. NÃO crie outro horário no lugar dele."]
          : []),
        "- Horário a mais: chame addAppointment de novo com os mesmos dados.",
        "Nunca mostre o id interno à cliente.",
      ].join("\n")
    )
  }
}
