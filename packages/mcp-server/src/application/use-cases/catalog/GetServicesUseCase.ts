import { Result, ok } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { IServiceRepository } from "../../../domain/repositories"
import { ServiceDTO, ServiceListDTO } from "../../dtos"

export interface GetServicesInput {
  salonId: string
  includeInactive?: boolean
}

export class GetServicesUseCase {
  constructor(private serviceRepo: IServiceRepository) {}

  async execute(
    input: GetServicesInput
  ): Promise<Result<ServiceListDTO, DomainError>> {
    const services = await this.serviceRepo.findBySalon(
      input.salonId,
      input.includeInactive
    )

    const serviceDTOs: ServiceDTO[] = services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      duration: service.blockingDurationMinutes,
      durationFormatted: service.formatDurationLabel(),
      price: service.priceAmount,
      priceFormatted: service.formatPrice(),
      priceOnRequest: service.priceOnRequest,
      allowedWeekdays: service.allowedWeekdays,
      allowedStartTimes: service.allowedStartTimes,
      isActive: service.isActive,
    }))

    return ok({
      services: serviceDTOs,
      total: serviceDTOs.length,
      message: `${serviceDTOs.length} serviço(s) encontrado(s)`,
    })
  }
}
