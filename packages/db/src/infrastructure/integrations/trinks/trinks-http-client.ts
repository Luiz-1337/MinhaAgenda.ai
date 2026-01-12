import type { ILogger } from '../../../infrastructure/logger'
import { TRINKS_API_BASE_URL } from '../../../domain/constants'
import { IntegrationError } from '../../../domain/errors/integration-error'
import type { SalonId } from '../../../domain/integrations/value-objects/salon-id'

/**
 * HTTP client for Trinks API
 * Encapsulates fetch logic with error handling
 */
export class TrinksHttpClient {
  constructor(
    private readonly token: string,
    private readonly logger: ILogger
  ) {}

  async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
      body?: unknown
    } = {}
  ): Promise<T> {
    const url = `${TRINKS_API_BASE_URL}${endpoint}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }

    const config: RequestInit = {
      method: options.method || 'GET',
      headers,
    }

    if (options.body && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH')) {
      config.body = JSON.stringify(options.body)
    }

    try {
      const response = await fetch(url, config)

      if (!response.ok) {
        const errorText = await response.text()
        this.logger.error('Trinks API request failed', {
          status: response.status,
          endpoint,
          error: errorText,
        })
        throw new IntegrationError(
          `Trinks API error (${response.status}): ${errorText}`,
          'trinks',
          { endpoint, status: response.status }
        )
      }

      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return null as T
      }

      return await response.json()
    } catch (error) {
      if (error instanceof IntegrationError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to make request to Trinks API', { endpoint, error: errorMessage }, error as Error)
      throw new IntegrationError(`Failed to request Trinks API: ${errorMessage}`, 'trinks', {
        endpoint,
      })
    }
  }
}
