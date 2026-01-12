import type { ILogger } from '../../../infrastructure/logger'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { TrinksApiClient } from './services/trinks-api-client'
import { createSalonId } from '../../../domain/integrations/value-objects/index'

/**
 * Resource type for Trinks resources
 */
export type TrinksResourceType = 'profissionais' | 'servicos' | 'produtos'

/**
 * Use case for fetching Trinks resources (professionals, services, products)
 */
export class FetchTrinksResourcesUseCase {
  private readonly apiClient: TrinksApiClient

  constructor(
    private readonly logger: ILogger,
    salonId: string
  ) {
    this.apiClient = new TrinksApiClient(createSalonId(salonId), logger)
  }

  async execute(resourceType: TrinksResourceType): Promise<unknown[]> {
    if (!(await this.apiClient.isActive())) {
      throw new IntegrationError('Trinks integration not active', 'trinks', { salonId: this.apiClient['salonId'] })
    }

    try {
      const response = await this.apiClient.request<{ data?: unknown[] } | unknown[]>(
        `/${resourceType}`
      )

      if (Array.isArray(response)) {
        return response
      }

      if (
        response &&
        typeof response === 'object' &&
        'data' in response &&
        Array.isArray(response.data)
      ) {
        return response.data
      }

      return []
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Failed to fetch Trinks resources', {
        resourceType,
        error: errorMessage,
      }, error as Error)
      throw new IntegrationError(`Failed to fetch ${resourceType}: ${errorMessage}`, 'trinks', {
        resourceType,
      })
    }
  }
}
