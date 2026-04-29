import { Result, ok, fail, isOk } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { Phone } from "../../../domain/value-objects"
import { IRetentionRepository } from "../../../domain/repositories"

export interface RecordCustomerOptOutInput {
  salonId: string
  phone: string
  reason: string
  source: "keyword" | "manual" | "admin"
}

export interface RecordCustomerOptOutOutput {
  customerId: string
  optedOutAt: Date
  alreadyOptedOut: boolean
}

/**
 * Idempotent opt-out write. Multi-tenant by (salonId, phone).
 * If the customer was already opted out, returns the existing timestamp.
 * If the customer does not exist in the salon, fails (caller should
 * decide whether to upsert — we do not auto-create here).
 */
export class RecordCustomerOptOutUseCase {
  constructor(private retentionRepo: IRetentionRepository) {}

  async execute(
    input: RecordCustomerOptOutInput
  ): Promise<Result<RecordCustomerOptOutOutput, DomainError>> {
    if (!input.salonId) return fail(new RequiredFieldError("salonId"))
    if (!input.phone) return fail(new RequiredFieldError("phone"))
    if (!input.reason) return fail(new RequiredFieldError("reason"))

    const phoneResult = Phone.create(input.phone)
    if (!isOk(phoneResult)) {
      return fail(phoneResult.error)
    }
    const normalized = phoneResult.data.normalize()

    const result = await this.retentionRepo.markOptOut({
      salonId: input.salonId,
      phone: normalized,
      reason: input.reason.slice(0, 500),
      source: input.source,
    })

    return ok({
      customerId: result.customerId,
      optedOutAt: result.optedOutAt,
      alreadyOptedOut: result.alreadyOptedOut,
    })
  }
}
