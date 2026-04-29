import { Result, ok, fail, isOk } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { Phone } from "../../../domain/value-objects"
import { IRetentionRepository } from "../../../domain/repositories"

export interface FlagSuspectedOptOutInput {
  salonId: string
  customerId: string | null
  phone: string
  responseBody: string
  retentionCampaignMessageId: string | null
}

export interface FlagSuspectedOptOutOutput {
  auditId: string
}

/**
 * Camada 2 do opt-out — registra para revisao humana/LLM um cliente que
 * respondeu com sinais de irritacao apos receber uma mensagem AI de retencao.
 * NAO marca opt-out automaticamente — a Camada 3 (cron) classifica e age.
 */
export class FlagSuspectedOptOutUseCase {
  constructor(private retentionRepo: IRetentionRepository) {}

  async execute(
    input: FlagSuspectedOptOutInput
  ): Promise<Result<FlagSuspectedOptOutOutput, DomainError>> {
    if (!input.salonId) return fail(new RequiredFieldError("salonId"))
    if (!input.phone) return fail(new RequiredFieldError("phone"))
    if (!input.responseBody) return fail(new RequiredFieldError("responseBody"))

    const phoneResult = Phone.create(input.phone)
    if (!isOk(phoneResult)) {
      return fail(phoneResult.error)
    }
    const normalized = phoneResult.data.normalize()

    const auditId = await this.retentionRepo.flagSuspectedOptOut({
      salonId: input.salonId,
      customerId: input.customerId,
      phone: normalized,
      responseBody: input.responseBody.slice(0, 2000),
      retentionCampaignMessageId: input.retentionCampaignMessageId,
    })

    return ok({ auditId })
  }
}
