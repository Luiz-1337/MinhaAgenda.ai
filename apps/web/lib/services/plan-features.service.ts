import { db, salons, profiles, eq } from "@repo/db"
import type { PlanTier } from "@/lib/types/salon"

/**
 * Features gateadas por plano.
 *
 * Declarativo de propósito: adicionar uma feature é uma linha aqui, não um `if`
 * espalhado numa tela.
 *
 * Divisão com `lib/plans.ts`: lá ficam os NÚMEROS do plano (preço, limites,
 * créditos); aqui fica o SIM/NÃO de acesso a uma tela ou recurso.
 *
 * A versão anterior deste comentário alertava que os limites de plano se
 * contradiziam entre si — resolvido pelo catálogo único. Mas ele próprio repetia o
 * engano central: dizia que `PLAN_LIMITS.PRO = 7` eram salões, quando sempre foram
 * profissionais por salão. O plano PRO permite 3 salões e 7 profissionais em cada.
 */
export type PlanFeature = 'advanced_reports'

const FEATURES_BY_TIER: Record<PlanFeature, readonly PlanTier[]> = {
  /**
   * O Relatório 360 (/[salonId]/reports).
   *
   * PRO e ENTERPRISE. É o "Relatórios avançados" que a tela de billing já lista como
   * benefício do plano PRO desde antes de existir — ou seja, estava vendido e não
   * entregue.
   */
  advanced_reports: ['PRO', 'ENTERPRISE'],
} as const

/** A feature está incluída neste plano? Função pura — testável sem banco. */
export function hasFeature(tier: PlanTier | null | undefined, feature: PlanFeature): boolean {
  if (!tier) return false
  return FEATURES_BY_TIER[feature].includes(tier)
}

/** Planos que dão acesso à feature — para a tela de upgrade dizer QUAL plano assinar. */
export function tiersWithFeature(feature: PlanFeature): readonly PlanTier[] {
  return FEATURES_BY_TIER[feature]
}

/**
 * Plano do salão.
 *
 * O tier mora em `profiles.tier` do DONO, não em `salons` — daí o join por `ownerId`.
 * Mesmo caminho que `credits.service.ts` já usa.
 */
export async function getSalonTier(salonId: string): Promise<PlanTier | null> {
  if (!salonId) return null

  const [row] = await db
    .select({ tier: profiles.tier })
    .from(salons)
    .innerJoin(profiles, eq(salons.ownerId, profiles.id))
    .where(eq(salons.id, salonId))
    .limit(1)

  return (row?.tier as PlanTier | undefined) ?? null
}

/**
 * O salão tem acesso à feature?
 *
 * Use no SERVIDOR, antes de consultar qualquer coisa — o gate da UI é cortesia, este
 * é a trava.
 */
export async function salonHasFeature(
  salonId: string,
  feature: PlanFeature
): Promise<boolean> {
  return hasFeature(await getSalonTier(salonId), feature)
}
