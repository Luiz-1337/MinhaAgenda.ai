import { Result, ok, fail } from "../../../shared/types"
import { DomainError, PlanRestrictionError } from "../../../domain/errors"
import {
  IProfessionalRepository,
  IServiceRepository,
  ISalonRepository,
} from "../../../domain/repositories"
import { ProfessionalDTO, ProfessionalListDTO } from "../../dtos"

export interface GetProfessionalsInput {
  salonId: string
  includeInactive?: boolean
  /** Se informado, retorna só quem realiza o serviço, marcando especialistas. */
  serviceId?: string
}

export class GetProfessionalsUseCase {
  constructor(
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository,
    private salonRepo: ISalonRepository
  ) {}

  async execute(
    input: GetProfessionalsInput
  ): Promise<Result<ProfessionalListDTO, DomainError>> {
    // Plano SOLO: o salão tem 1 profissional, já disponível no contexto do sistema.
    // Não faz sentido listar profissionais.
    const salon = await this.salonRepo.findById(input.salonId)
    if (salon && salon.isSoloPlan()) {
      return fail(
        new PlanRestrictionError(
          "Plano SOLO: este salão tem apenas 1 profissional. O professionalId já está disponível no contexto do sistema. Não é necessário listar profissionais."
        )
      )
    }

    // Filtro por serviço: retorna só quem realiza o serviço, especialistas primeiro.
    if (input.serviceId) {
      const allServices = await this.serviceRepo.findBySalon(input.salonId, true)
      const serviceName = allServices.find((s) => s.id === input.serviceId)?.name
      const capable = await this.professionalRepo.findByServiceWithSpecialist(
        input.serviceId,
        input.salonId
      )

      const dtos: ProfessionalDTO[] = capable
        .sort((a, b) => Number(b.isSpecialist) - Number(a.isSpecialist))
        .map(({ professional, isSpecialist }) => ({
          id: professional.id,
          name: professional.name,
          isActive: professional.isActive,
          serviceIds: [input.serviceId!],
          services: serviceName ? [serviceName] : [],
          isSpecialist,
        }))

      return ok({
        professionals: dtos,
        total: dtos.length,
        message:
          dtos.length === 0
            ? "Nenhum profissional realiza este serviço"
            : `${dtos.length} profissional(is) realiza(m) este serviço`,
      })
    }

    const professionals = await this.professionalRepo.findBySalon(
      input.salonId,
      input.includeInactive
    )

    // Buscar todos os serviços para mapear IDs para nomes
    const services = await this.serviceRepo.findBySalon(input.salonId, true)
    const serviceMap = new Map(services.map((s) => [s.id, s.name]))

    const professionalDTOs: ProfessionalDTO[] = professionals.map((professional) => ({
      id: professional.id,
      name: professional.name,
      isActive: professional.isActive,
      serviceIds: professional.services,
      services: professional.services
        .map((id) => serviceMap.get(id))
        .filter((name): name is string => !!name),
    }))

    return ok({
      professionals: professionalDTOs,
      total: professionalDTOs.length,
      message: `${professionalDTOs.length} profissional(is) encontrado(s)`,
    })
  }
}
