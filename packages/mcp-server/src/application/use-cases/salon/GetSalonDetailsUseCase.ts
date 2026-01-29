import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { ISalonRepository } from "../../../domain/repositories"
import { SalonDTO } from "../../dtos"

export class GetSalonDetailsUseCase {
  constructor(private salonRepo: ISalonRepository) {}

  async execute(salonId: string): Promise<Result<SalonDTO, DomainError>> {
    const salon = await this.salonRepo.findById(salonId)

    if (!salon) {
      return fail(new Error(`Salão ${salonId} não encontrado`) as DomainError)
    }

    return ok({
      id: salon.id,
      name: salon.name,
      address: salon.address,
      phone: salon.phone,
      whatsapp: salon.whatsapp,
      description: salon.description,
      cancellationPolicy: salon.getCancellationPolicy(),
      businessHours: salon.workingHours,
      settings: salon.settings,
      message: "Informações do salão recuperadas com sucesso",
    })
  }
}
