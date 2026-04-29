import { Result, ok, fail } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { IRetentionRepository } from "../../../domain/repositories"
import {
  FindInactiveCustomersInputDTO,
  FindInactiveCustomersOutputDTO,
  InactiveCustomerDTO,
} from "./dto/InactiveCustomerDTO"

/**
 * Returns inactive customers for a salon, applying:
 *  - per-service cycle (services.average_cycle_days || defaultCycleDays)
 *  - opt-out exclusion (customers.opted_out_at IS NULL)
 *  - cooldown (no AI message in last `cooldownDays` days)
 *  - strict keyset pagination by (lastVisitAt DESC NULLS LAST, customerId ASC)
 */
export class FindInactiveCustomersUseCase {
  constructor(private retentionRepo: IRetentionRepository) {}

  async execute(
    input: FindInactiveCustomersInputDTO
  ): Promise<Result<FindInactiveCustomersOutputDTO, DomainError>> {
    if (!input.salonId) {
      return fail(new RequiredFieldError("salonId"))
    }
    if (!Number.isFinite(input.daysAfterInactivity) || input.daysAfterInactivity <= 0) {
      return fail(new RequiredFieldError("daysAfterInactivity"))
    }
    if (!Number.isFinite(input.defaultCycleDays) || input.defaultCycleDays <= 0) {
      return fail(new RequiredFieldError("defaultCycleDays"))
    }

    const limit = input.limit ?? 50

    const rows = await this.retentionRepo.findInactive({
      salonId: input.salonId,
      minDaysSinceVisit: input.daysAfterInactivity,
      defaultCycleDays: input.defaultCycleDays,
      cooldownDays: input.cooldownDays,
      limit,
      cursor: input.cursor,
    })

    const items: InactiveCustomerDTO[] = rows.map((r) => ({
      customerId: r.customerId,
      salonId: r.salonId,
      name: r.name,
      phone: r.phone,
      lastVisitAt: r.lastVisitAt,
      lastServiceId: r.lastServiceId,
      lastServiceName: r.lastServiceName,
      lastProfessionalId: r.lastProfessionalId,
      lastProfessionalName: r.lastProfessionalName,
      cycleDaysUsed: r.cycleDaysUsed,
      daysSinceVisit: r.daysSinceVisit,
    }))

    const nextCursor =
      items.length === limit
        ? {
            lastVisitAt: items[items.length - 1].lastVisitAt,
            customerId: items[items.length - 1].customerId,
          }
        : undefined

    return ok({ items, nextCursor })
  }
}
