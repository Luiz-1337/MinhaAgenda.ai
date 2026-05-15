import { randomUUID } from "node:crypto"
import { Result, ok, fail } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { ICustomerTrinksProfileRepository } from "../../../domain/repositories"
import { CustomerTrinksProfile } from "../../../domain/entities/CustomerTrinksProfile"
import { ITrinksCustomerService } from "../../ports/ITrinksCustomerService"

export interface SyncCustomerTrinksProfileInput {
  salonId: string
  customerId: string
  customerPhone: string
}

export interface SyncCustomerTrinksProfileOutput {
  status: "synced" | "not_found" | "skipped_inactive"
  profile?: CustomerTrinksProfile
}

class TrinksSyncFailedError extends DomainError {
  readonly code = "TRINKS_SYNC_FAILED"
  constructor(reason: string) {
    super(`Falha ao sincronizar perfil Trinks: ${reason}`)
  }
}

/**
 * Refreshes (or creates) the local cached Cliente 360° profile for a single
 * customer by querying the Trinks API.
 *
 * Behavior:
 *   1. Phone lookup → null  ⇒ marks `trinks_not_found=true` (cached for 7d)
 *   2. Phone lookup → hit   ⇒ fetches history, computes vipScore, upserts profile
 *   3. Network/HTTP error   ⇒ Result.fail; caller decides retry policy
 *
 * Idempotent: safe to re-run for the same customer at any cadence.
 */
export class SyncCustomerTrinksProfileUseCase {
  constructor(
    private readonly trinksCustomerService: ITrinksCustomerService,
    private readonly profileRepo: ICustomerTrinksProfileRepository
  ) {}

  async execute(
    input: SyncCustomerTrinksProfileInput
  ): Promise<Result<SyncCustomerTrinksProfileOutput, DomainError>> {
    if (!input.salonId) return fail(new RequiredFieldError("salonId"))
    if (!input.customerId) return fail(new RequiredFieldError("customerId"))
    if (!input.customerPhone) return fail(new RequiredFieldError("customerPhone"))

    try {
      const client = await this.trinksCustomerService.findClientByPhone(
        input.salonId,
        input.customerPhone
      )

      if (!client) {
        await this.profileRepo.markNotFound({
          customerId: input.customerId,
          salonId: input.salonId,
        })
        return ok({ status: "not_found" })
      }

      const history = await this.trinksCustomerService.fetchClientHistory(
        input.salonId,
        client.trinksClientId
      )

      const vipScore = CustomerTrinksProfile.computeVipScore({
        totalSpent: history.totalSpent,
        visitCount365Days: history.visitCount365Days,
      })

      const now = new Date()
      const existing = await this.profileRepo.findByCustomerId(input.customerId)

      const profile = CustomerTrinksProfile.create({
        id: existing?.id ?? randomUUID(),
        customerId: input.customerId,
        salonId: input.salonId,
        trinksClientId: client.trinksClientId,
        totalSpent: history.totalSpent,
        averageTicket: history.averageTicket,
        visitCount90Days: history.visitCount90Days,
        visitCount365Days: history.visitCount365Days,
        lastVisitAt: history.lastVisitAt,
        firstVisitAt: history.firstVisitAt ?? client.firstVisitAt ?? null,
        tags: client.tags,
        recentServices: history.recentServices,
        vipScore,
        trinksNotFound: false,
        syncedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })

      await this.profileRepo.upsert(profile)

      return ok({ status: "synced", profile })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      return fail(new TrinksSyncFailedError(reason))
    }
  }
}
