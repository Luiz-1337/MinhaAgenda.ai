/**
 * Serviço de regras de negócio relacionadas a planos do salão (DOMAIN LAYER)
 */

import { db, salons, profiles, professionals } from "@repo/db"
import { and, eq } from "drizzle-orm"

export type SalonTier = "SOLO" | "TEAM" | "ENTERPRISE"

export class SalonPlanService {
  /**
   * Verifica se o salão é do plano SOLO
   */
  static async isSoloPlan(salonId: string): Promise<boolean> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (!salon) {
      return false
    }

    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, salon.ownerId),
      columns: { tier: true },
    })

    return ownerProfile?.tier === "SOLO"
  }

  /**
   * Busca o profissional do dono do salão (para plano SOLO)
   */
  static async findOwnerProfessional(salonId: string): Promise<string | null> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (!salon) {
      return null
    }

    const userProfessional = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.userId, salon.ownerId)
      ),
      columns: { id: true },
    })

    return userProfessional?.id || null
  }
}
