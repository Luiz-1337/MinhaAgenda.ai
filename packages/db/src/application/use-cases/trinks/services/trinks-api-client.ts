import type { ILogger } from '../../../../infrastructure/logger'
import { TrinksHttpClient } from '../../../../infrastructure/integrations/trinks/trinks-http-client'
import { db, salonIntegrations } from '../../../../index'
import { and, eq } from 'drizzle-orm'
import { IntegrationProvider } from '../../../../domain/integrations/enums/integration-provider.enum'
import type { SalonId } from '../../../../domain/integrations/value-objects/salon-id'

/**
 * Trinks API client - manages authentication and requests
 */
export class TrinksApiClient {
  private httpClient: TrinksHttpClient | null = null

  constructor(
    private readonly salonId: SalonId,
    private readonly logger: ILogger
  ) {}

  private async getToken(): Promise<string | null> {
    const integration = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, this.salonId),
        eq(salonIntegrations.provider, IntegrationProvider.TRINKS)
      ),
    })

    if (!integration || !integration.accessToken) {
      return null
    }

    return integration.accessToken
  }

  private async getClient(): Promise<TrinksHttpClient> {
    if (this.httpClient) {
      return this.httpClient
    }

    const token = await this.getToken()
    if (!token) {
      throw new Error('Trinks integration not configured or token invalid')
    }

    this.httpClient = new TrinksHttpClient(token, this.logger)
    return this.httpClient
  }

  async isActive(): Promise<boolean> {
    const token = await this.getToken()
    return token !== null
  }

  async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      body?: unknown
    } = {}
  ): Promise<T> {
    const client = await this.getClient()
    return client.request<T>(endpoint, options)
  }
}
