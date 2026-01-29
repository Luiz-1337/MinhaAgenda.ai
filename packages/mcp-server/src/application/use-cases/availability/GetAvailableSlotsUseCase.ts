import { Result, ok, fail, isOk } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { CheckAvailabilityUseCase } from "./CheckAvailabilityUseCase"
import { AvailabilityDTO, CheckAvailabilityDTO } from "../../dtos"

/**
 * Use Case para obter slots disponíveis formatados
 * Wrapper sobre CheckAvailabilityUseCase com filtragem adicional
 */
export class GetAvailableSlotsUseCase {
  constructor(private checkAvailabilityUseCase: CheckAvailabilityUseCase) {}

  async execute(
    input: CheckAvailabilityDTO
  ): Promise<Result<AvailabilityDTO, DomainError>> {
    const result = await this.checkAvailabilityUseCase.execute(input)

    if (!isOk(result)) {
      return result
    }

    // Filtra apenas slots disponíveis
    const availableOnly = result.data.slots.filter((s) => s.available)

    return ok({
      ...result.data,
      slots: availableOnly,
      message:
        availableOnly.length === 0
          ? "Não há horários disponíveis nesta data"
          : `Horários disponíveis: ${availableOnly.map((s) => s.time).join(", ")}`,
    })
  }
}
