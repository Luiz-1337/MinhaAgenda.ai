import type { PlanTier } from "@/lib/types/salon"

export const PLAN_LIMITS = {
  SOLO: 1,
  PRO: 7,
  ENTERPRISE: Infinity,
} as const

export const AGENT_LIMITS = {
  SOLO: 1,
  PRO: 3,
  ENTERPRISE: Infinity,
} as const

export const ENTERPRISE_INCLUDED_AGENTS = 3
export const EXTRA_AGENT_PRICE_BRL = 150

/**
 * Verifica se é possível adicionar um novo profissional ao salão
 * Para SOLO: sempre retorna false quando já houver 1 profissional (apenas o owner pode existir)
 */
export function canAddProfessional(planTier: PlanTier, currentCount: number): boolean {
  if (planTier === 'SOLO') {
    return currentCount < 1
  }

  const limit = PLAN_LIMITS[planTier]
  return currentCount < limit
}

/**
 * Verifica se é possível adicionar um novo agente ao salão
 */
export function canAddAgent(planTier: PlanTier, currentCount: number): boolean {
  const limit = AGENT_LIMITS[planTier]
  return currentCount < limit
}

/**
 * Calcula quantos agentes extras (além dos inclusos) um salão Enterprise tem
 */
export function getExtraAgentCount(planTier: PlanTier, agentCount: number): number {
  if (planTier !== 'ENTERPRISE') return 0
  return Math.max(0, agentCount - ENTERPRISE_INCLUDED_AGENTS)
}

/**
 * Retorna o limite de agentes para o plano
 */
export function getAgentLimit(planTier: PlanTier): number {
  return AGENT_LIMITS[planTier]
}




