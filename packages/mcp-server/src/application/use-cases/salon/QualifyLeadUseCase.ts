import { Result, ok } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { ILeadRepository, Lead } from "../../../domain/repositories"
import { QualifyLeadDTO, QualifyLeadResultDTO } from "../../dtos"

const INTEREST_TO_STATUS: Record<string, Lead["status"]> = {
  high: "recently_scheduled",
  medium: "new",
  low: "cold",
  none: "cold",
}

const INTEREST_LABELS: Record<string, string> = {
  high: "alto",
  medium: "médio",
  low: "baixo",
  none: "nenhum",
}

export class QualifyLeadUseCase {
  constructor(private leadRepo: ILeadRepository) {}

  async execute(
    input: QualifyLeadDTO
  ): Promise<Result<QualifyLeadResultDTO, DomainError>> {
    const status = INTEREST_TO_STATUS[input.interest] ?? "new"

    const lead = await this.leadRepo.upsert({
      salonId: input.salonId,
      phoneNumber: input.phoneNumber,
      status,
      notes: input.notes,
      lastContactAt: new Date(),
    })

    return ok({
      leadId: lead.id,
      status: lead.status,
      message: `Lead qualificado com interesse ${INTEREST_LABELS[input.interest] ?? input.interest}`,
    })
  }
}
