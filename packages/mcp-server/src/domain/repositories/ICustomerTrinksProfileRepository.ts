import { CustomerTrinksProfile } from "../entities/CustomerTrinksProfile"

/**
 * Persistence port for CustomerTrinksProfile aggregate.
 * Profiles are upserted by sync jobs and read on every conversation by the agent.
 */
export interface ICustomerTrinksProfileRepository {
  /**
   * Returns the profile for a given customer, or null if never synced.
   */
  findByCustomerId(customerId: string): Promise<CustomerTrinksProfile | null>

  /**
   * Returns oldest-synced profiles for a salon (for cron refresh).
   * Excludes profiles with trinks_not_found=true synced more recently than the
   * not-found-retry window.
   */
  findStaleForSalon(
    salonId: string,
    olderThan: Date,
    limit: number
  ): Promise<CustomerTrinksProfile[]>

  /**
   * Counts profiles for a salon and returns the most recent syncedAt timestamp.
   * Used by the UI to show sync status to the salon owner.
   */
  countAndLastSyncForSalon(salonId: string): Promise<{ count: number; lastSyncedAt: Date | null }>

  /**
   * Inserts or updates a profile. Idempotent.
   */
  upsert(profile: CustomerTrinksProfile): Promise<void>

  /**
   * Marks a customer as not found in Trinks (cached so we stop hitting the API).
   * Creates a placeholder row if one doesn't exist.
   */
  markNotFound(input: { customerId: string; salonId: string }): Promise<void>
}
