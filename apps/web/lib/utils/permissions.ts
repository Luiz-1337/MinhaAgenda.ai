import type { PlanTier } from "@/lib/types/salon"

export const PLAN_LIMITS = {
  SOLO: 1,
  PRO: 7, // Exemplo, pode ser ajustado
  ENTERPRISE: Infinity,
} as const

export function canAddProfessional(planTier: PlanTier, currentCount: number): boolean {
  const limit = PLAN_LIMITS[planTier]
  return currentCount < limit
}




