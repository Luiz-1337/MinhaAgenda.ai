import { db, salons, profiles, eq } from "@repo/db"
import type { PlanTier } from "@/lib/types/salon"

/**
 * Features gateadas por plano.
 *
 * Este é o PRIMEIRO gate de feature-por-plano do projeto. Até aqui existiam apenas
 * limites numéricos (`PLAN_LIMITS`, `AGENT_LIMITS` em lib/utils/permissions.ts) e um
 * único `if` de tier, no dashboard. Nenhum helper de "esta tela exige plano X".
 *
 * Declarativo de propósito: adicionar uma feature é uma linha aqui, não um `if`
 * espalhado numa tela. Quando a segunda feature gateada aparecer, o formato já serve.
 *
 * ⚠️ NÃO confunda com os LIMITES de plano, que estão em outro arquivo e hoje se
 * contradizem entre si (`PLAN_LIMITS.PRO = 7` salões contra "Até 3 Salões" na tela de
 * billing e "3 Salões" na tela admin; `PLAN_CREDITS.PRO = 5.000.000` contra
 * "25.000 Tokens/mês" na mesma tela admin; e `salon-plan.service.ts` declara um tier
 * fantasma `TEAM` que não existe em lugar nenhum). Essa bagunça é dívida separada e
 * de propósito NÃO é tocada aqui — este arquivo só lê SOLO | PRO | ENTERPRISE.
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
