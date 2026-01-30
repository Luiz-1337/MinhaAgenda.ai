/**
 * Implementação do IIntegrationRepository usando Drizzle
 */

import { db, salonIntegrations, and, eq } from '@repo/db'
import { IIntegrationRepository } from '../../application/ports'

export class DrizzleIntegrationRepository implements IIntegrationRepository {
  /**
   * Verifica se a integração com Google Calendar está ativa para o salão
   */
  async isGoogleActive(salonId: string): Promise<boolean> {
    const [integration] = await db
      .select()
      .from(salonIntegrations)
      .where(
        and(
          eq(salonIntegrations.salonId, salonId),
          eq(salonIntegrations.provider, 'google'),
          eq(salonIntegrations.isActive, true)
        )
      )
      .limit(1)
    return !!integration && !!integration.refreshToken
  }

  /**
   * Verifica se a integração com Trinks está ativa para o salão
   */
  async isTrinksActive(salonId: string): Promise<boolean> {
    const [integration] = await db
      .select()
      .from(salonIntegrations)
      .where(
        and(
          eq(salonIntegrations.salonId, salonId),
          eq(salonIntegrations.provider, 'trinks'),
          eq(salonIntegrations.isActive, true)
        )
      )
      .limit(1)
    return !!integration && !!integration.accessToken
  }
}
