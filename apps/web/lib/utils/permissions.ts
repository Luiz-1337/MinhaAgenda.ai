import type { PlanTier } from "@/lib/types/salon"

export const PLAN_LIMITS = {
  SOLO: 1,
  PRO: 7, // Exemplo, pode ser ajustado
  ENTERPRISE: Infinity,
} as const

/**
 * Verifica se é possível adicionar um novo profissional ao salão
 * Para SOLO: sempre retorna false quando já houver 1 profissional (apenas o owner pode existir)
 */
export function canAddProfessional(planTier: PlanTier, currentCount: number): boolean {
  // Para SOLO, sempre bloquear se já houver 1 profissional (o owner)
  if (planTier === 'SOLO') {
    return currentCount < 1
  }
  
  const limit = PLAN_LIMITS[planTier]
  return currentCount < limit
}




