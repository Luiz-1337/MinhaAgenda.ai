import type { IOAuth2Client, OAuth2Credentials, OAuth2ClientResult } from '../../../domain/integrations/interfaces/oauth2-client.interface'
import type { SalonId } from '../../../domain/integrations/value-objects/salon-id'
import type { ILogger } from '../../../infrastructure/logger'
import { OAuth2Client } from 'google-auth-library'
import { db, salonIntegrations } from '../../../index'
import { eq } from 'drizzle-orm'
import { TOKEN_REFRESH_MARGIN_MS, GOOGLE_TIMEZONE_DEFAULT } from '../../../domain/constants'
import { IntegrationError } from '../../../domain/errors/integration-error'

/**
 * Google OAuth2 client implementation
 */
export class GoogleOAuth2Client implements IOAuth2Client {
  private readonly oauth2Client: OAuth2Client

  constructor(
    private readonly logger: ILogger,
    clientId?: string,
    clientSecret?: string,
    redirectUri?: string
  ) {
    const googleClientId = clientId || process.env.GOOGLE_CLIENT_ID
    const googleClientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET
    const googleRedirectUri =
      redirectUri ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/google/callback`

    if (!googleClientId || !googleClientSecret) {
      throw new IntegrationError(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured',
        'google'
      )
    }

    if (process.env.NODE_ENV === 'development') {
      this.logger.debug('OAuth2Client configured', {
        hasClientId: !!googleClientId,
        hasClientSecret: !!googleClientSecret,
        redirectUri: googleRedirectUri,
        clientIdPrefix: googleClientId.substring(0, 20) + '...',
      })
    }

    this.oauth2Client = new OAuth2Client(googleClientId, googleClientSecret, googleRedirectUri)
  }

  async getSalonClient(salonId: SalonId): Promise<OAuth2ClientResult | null> {
    this.logger.debug('Getting salon Google client', { salonId })

    const integration = await db.query.salonIntegrations.findFirst({
      where: eq(salonIntegrations.salonId, salonId),
    })

    if (!integration || !integration.refreshToken) {
      this.logger.warn('Integration not found or missing refresh token', { salonId })
      return null
    }

    this.logger.debug('Integration found, configuring OAuth2Client', {
      hasRefreshToken: !!integration.refreshToken,
      hasAccessToken: !!integration.accessToken,
      email: integration.email,
    })

    this.oauth2Client.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken || undefined,
      expiry_date: integration.expiresAt ? integration.expiresAt * 1000 : undefined,
    })

    const now = Date.now()
    const expiresAt = integration.expiresAt ? integration.expiresAt * 1000 : 0

    if (!integration.accessToken || (expiresAt && expiresAt - now < TOKEN_REFRESH_MARGIN_MS)) {
      try {
        this.logger.debug('Refreshing OAuth2 token', { salonId })

        const credentials = await this.refreshToken(salonId, integration.refreshToken)

        await db
          .update(salonIntegrations)
          .set({
            accessToken: credentials.accessToken || null,
            expiresAt: credentials.expiryDate ? Math.floor(credentials.expiryDate / 1000) : null,
            updatedAt: new Date(),
          })
          .where(eq(salonIntegrations.id, integration.id))

        this.oauth2Client.setCredentials({
          refresh_token: credentials.refreshToken,
          access_token: credentials.accessToken || undefined,
          expiry_date: credentials.expiryDate || undefined,
        })

        this.logger.info('Token refreshed successfully', { salonId })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isInvalidGrant = this.isInvalidGrantError(error)

        if (isInvalidGrant) {
          this.logger.warn('Invalid grant - removing integration', {
            salonId,
            integrationId: integration.id,
            error: errorMessage,
          })

          await db.delete(salonIntegrations).where(eq(salonIntegrations.id, integration.id))

          return null
        }

        this.logger.error('Failed to refresh token', { salonId, error: errorMessage }, error as Error)
        throw new IntegrationError('Failed to refresh OAuth2 token', 'google', {
          salonId,
          error: errorMessage,
        })
      }
    }

    return {
      client: this.oauth2Client,
      email: integration.email || undefined,
    }
  }

  async refreshToken(salonId: SalonId, refreshToken: string): Promise<OAuth2Credentials> {
    this.logger.debug('Refreshing OAuth2 token', { salonId })

    this.oauth2Client.setCredentials({
      refresh_token: refreshToken,
    })

    const { credentials } = await this.oauth2Client.refreshAccessToken()

    return {
      refreshToken: credentials.refresh_token || refreshToken,
      accessToken: credentials.access_token || undefined,
      expiryDate: credentials.expiry_date || undefined,
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

  getRawClient(): OAuth2Client {
    return this.oauth2Client
  }
}
