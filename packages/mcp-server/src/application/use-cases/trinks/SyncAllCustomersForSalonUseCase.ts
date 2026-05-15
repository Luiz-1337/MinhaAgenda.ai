import { Result, ok, fail } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { ICustomerRepository, ICustomerTrinksProfileRepository } from "../../../domain/repositories"
import { SyncCustomerTrinksProfileUseCase } from "./SyncCustomerTrinksProfileUseCase"

export interface SyncAllCustomersForSalonInput {
  salonId: string
  /** Process customers whose profile syncedAt is older than this date (or has no profile). */
  staleBefore?: Date
  /** Cap on number of customers processed per execution. Defaults to 200. */
  limit?: number
  /** Parallel API calls. Defaults to 5 to be conservative with Trinks rate limits. */
  concurrency?: number
}

export interface SyncAllCustomersForSalonOutput {
  scanned: number
  synced: number
  notFound: number
  failed: number
  skipped: number
}

const DEFAULT_LIMIT = 200
const DEFAULT_CONCURRENCY = 5
/** Customers without a profile are stale by definition; this cutoff applies to existing profiles. */
const DEFAULT_STALE_HOURS = 24

/**
 * Promise-pool helper with bounded concurrency.
 * Inline (no external dep) to match the convention in ai-retention-dispatcher.service.ts.
 */
async function batchProcess<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn) => Promise<TOut>
): Promise<Array<PromiseSettledResult<TOut>>> {
  const results: Array<PromiseSettledResult<TOut>> = new Array(items.length)
  let cursor = 0
  async function spawn() {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      try {
        results[idx] = { status: "fulfilled", value: await worker(items[idx]) }
      } catch (reason) {
        results[idx] = { status: "rejected", reason }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => spawn())
  )
  return results
}

/**
 * Batch-syncs Trinks profiles for all customers of a salon.
 *
 * Skips customers whose profile is fresh (synced after `staleBefore`) or
 * whose profile is marked `trinks_not_found` and still within retry cooldown
 * (handled inside SyncCustomerTrinksProfileUseCase via the not-found cache).
 *
 * Used by:
 *   - Daily cron (/api/cron/trinks-sync) — full salon sweep
 *   - Manual trigger from the salon owner UI
 */
export class SyncAllCustomersForSalonUseCase {
  constructor(
    private readonly customerRepo: ICustomerRepository,
    private readonly profileRepo: ICustomerTrinksProfileRepository,
    private readonly syncOne: SyncCustomerTrinksProfileUseCase
  ) {}

  async execute(
    input: SyncAllCustomersForSalonInput
  ): Promise<Result<SyncAllCustomersForSalonOutput, DomainError>> {
    if (!input.salonId) return fail(new RequiredFieldError("salonId"))

    const limit = input.limit ?? DEFAULT_LIMIT
    const concurrency = input.concurrency ?? DEFAULT_CONCURRENCY
    const staleThreshold =
      input.staleBefore ?? new Date(Date.now() - DEFAULT_STALE_HOURS * 60 * 60 * 1000)

    const allCustomers = await this.customerRepo.findBySalon(input.salonId)

    // Skip customers with fresh profile.
    const candidates: Array<{ id: string; phone: string }> = []
    let skipped = 0
    for (const customer of allCustomers) {
      if (candidates.length >= limit) break
      const existing = await this.profileRepo.findByCustomerId(customer.id)
      if (existing && !existing.isStale(DEFAULT_STALE_HOURS)) {
        skipped++
        continue
      }
      if (existing && existing.syncedAt > staleThreshold && !existing.trinksNotFound) {
        skipped++
        continue
      }
      candidates.push({ id: customer.id, phone: customer.phoneNumber })
    }

    if (candidates.length === 0) {
      return ok({ scanned: allCustomers.length, synced: 0, notFound: 0, failed: 0, skipped })
    }

    const results = await batchProcess(candidates, concurrency, async (c) => {
      return this.syncOne.execute({
        salonId: input.salonId,
        customerId: c.id,
        customerPhone: c.phone,
      })
    })

    let synced = 0
    let notFound = 0
    let failed = 0
    for (const r of results) {
      if (r.status !== "fulfilled") {
        failed++
        continue
      }
      if (!r.value.success) {
        failed++
        continue
      }
      if (r.value.data.status === "synced") synced++
      else if (r.value.data.status === "not_found") notFound++
      else if (r.value.data.status === "skipped_inactive") skipped++
    }

    return ok({
      scanned: allCustomers.length,
      synced,
      notFound,
      failed,
      skipped,
    })
  }
}
