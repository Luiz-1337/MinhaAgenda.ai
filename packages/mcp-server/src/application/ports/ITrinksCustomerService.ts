/**
 * Raw client lookup result from Trinks API.
 * Fields are the minimum we need to populate CustomerTrinksProfile.
 */
export interface TrinksClientRaw {
  trinksClientId: string
  name?: string | null
  email?: string | null
  phone?: string | null
  tags: string[]
  firstVisitAt?: Date | null
}

/**
 * Aggregated history snapshot used to compute totals/averages and recent services.
 */
export interface TrinksClientHistory {
  totalSpent: number
  averageTicket: number
  visitCount90Days: number
  visitCount365Days: number
  lastVisitAt: Date | null
  firstVisitAt: Date | null
  recentServices: Array<{
    serviceName: string
    professionalName?: string
    date: string  // ISO 8601
    amount?: number
  }>
}

/**
 * Port for customer-related Trinks API calls.
 *
 * The implementation lives in infrastructure/external/trinks/ and reuses the
 * existing TrinksApiClient (which handles token lookup and HTTP plumbing).
 * The use case uses this port without needing to know about HTTP details.
 */
export interface ITrinksCustomerService {
  /**
   * Looks up a Trinks client by phone number.
   * Returns null when the customer does not exist in Trinks for that salon.
   * Returns null also when the Trinks integration is not configured/active.
   */
  findClientByPhone(salonId: string, phone: string): Promise<TrinksClientRaw | null>

  /**
   * Fetches and aggregates the client's historical activity (visits + spend).
   * Caller must pass a trinksClientId obtained from findClientByPhone.
   */
  fetchClientHistory(salonId: string, trinksClientId: string): Promise<TrinksClientHistory>
}
