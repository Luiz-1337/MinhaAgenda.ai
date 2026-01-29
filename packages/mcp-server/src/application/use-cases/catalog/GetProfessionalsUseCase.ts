import { Result, ok } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { IProfessionalRepository, IServiceRepository } from "../../../domain/repositories"
import { ProfessionalDTO, ProfessionalListDTO } from "../../dtos"

export interface GetProfessionalsInput {
  salonId: string
  includeInactive?: boolean
}

export class GetProfessionalsUseCase {
  constructor(
    private professionalRepo: IProfessionalRepository,
    private serviceRepo: IServiceRepository
  ) {}

  async execute(
    input: GetProfessionalsInput
  ): Promise<Result<ProfessionalListDTO, DomainError>> {
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
