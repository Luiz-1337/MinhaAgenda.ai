import type { SalonId } from '../value-objects/salon-id'

/**
 * OAuth2 credentials
 */
export interface OAuth2Credentials {
  refreshToken: string
  accessToken?: string
  expiryDate?: number
}

/**
 * OAuth2 client result
 */
export interface OAuth2ClientResult {
  client: unknown // OAuth2Client type from google-auth-library
  email?: string
}

/**
 * OAuth2 client interface (DIP - Dependency Inversion Principle)
 */
export interface IOAuth2Client {
  /**
   * Gets authenticated client for a salon
   * @returns Client result or null if no integration
   */
  getSalonClient(salonId: SalonId): Promise<OAuth2ClientResult | null>

  /**
   * Refreshes access token
   */
  refreshToken(salonId: SalonId, refreshToken: string): Promise<OAuth2Credentials>
}
