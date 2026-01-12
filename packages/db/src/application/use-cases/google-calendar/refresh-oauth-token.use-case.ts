import type { IOAuth2Client } from '../../../domain/integrations/interfaces/oauth2-client.interface'
import type { ILogger } from '../../../infrastructure/logger'
import type { SalonId } from '../../../domain/integrations/value-objects/salon-id'
import { db, salonIntegrations } from '../../../index'
import { eq } from 'drizzle-orm'
import { IntegrationError } from '../../../domain/errors/integration-error'
import { TOKEN_REFRESH_MARGIN_MS } from '../../../domain/constants'

/**
 * Use case for refreshing OAuth2 tokens
 * Handles token refresh and invalid_grant errors
 */
export class RefreshOAuthTokenUseCase {
  constructor(
    private readonly oauth2Client: IOAuth2Client,
    private readonly logger: ILogger
  ) {}

  async execute(salonId: SalonId, integrationId: string): Promise<void> {
    const integration = await db.query.salonIntegrations.findFirst({
      where: eq(salonIntegrations.id, integrationId),
    })

    if (!integration || !integration.refreshToken) {
      throw new IntegrationError(
        'Integration not found or missing refresh token',
        'google',
        { salonId, integrationId }
      )
    }

    const now = Date.now()
    const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0

    const needsRefresh =
      !integration.accessToken || (expiresAt && expiresAt - now < TOKEN_REFRESH_MARGIN_MS)

    if (!needsRefresh) {
      this.logger.debug('Token ainda válido, não precisa refresh', { salonId })
      return
    }

    try {
      this.logger.debug('Refreshing OAuth2 token', { salonId })

      const credentials = await this.oauth2Client.refreshToken(
        salonId,
        integration.refreshToken
      )

      await db
        .update(salonIntegrations)
        .set({
          accessToken: credentials.accessToken || null,
          expiresAt: credentials.expiryDate ? Math.floor(credentials.expiryDate / 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(salonIntegrations.id, integrationId))

      this.logger.info('Token refreshed successfully', { salonId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isInvalidGrant = this.isInvalidGrantError(error)

      if (isInvalidGrant) {
        this.logger.warn('Invalid grant - removing integration', {
          salonId,
          integrationId,
          error: errorMessage,
        })

        await db.delete(salonIntegrations).where(eq(salonIntegrations.id, integrationId))

        throw new IntegrationError(
          'Refresh token invalid - integration removed. Re-authentication required.',
          'google',
          { salonId, integrationId }
        )
      }

      this.logger.error('Failed to refresh token', { salonId, error: errorMessage }, error as Error)
      throw new IntegrationError('Failed to refresh OAuth2 token', 'google', {
        salonId,
        error: errorMessage,
      })
    }
  }

  private isInvalidGrantError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const errorObj = error as Record<string, unknown>
    const responseData = errorObj.response as Record<string, unknown> | undefined
    const data = responseData?.data as Record<string, unknown> | undefined

    return (
      data?.error === 'invalid_grant' ||
      String(errorObj.message || '').includes('invalid_grant') ||
      (errorObj.code === 400 && data?.error === 'invalid_grant')
    )
  }
}
