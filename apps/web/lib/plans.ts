/**
 * Catálogo de planos — FONTE ÚNICA.
 *
 * Antes deste arquivo, os números de plano viviam em seis lugares que se
 * contradiziam. O levantamento de 10/ago/2026 encontrou, entre outras coisas:
 *
 *   - TRÊS tabelas de preço: R$ 299/R$ 999 na landing, no faturamento e na tela
 *     de assinatura expirada; R$ 49/R$ 149 na tela de pagamento do cadastro; e a
 *     tela admin com preço certo e créditos errados.
 *   - "Até 3 Salões" vendido em três telas, sem nenhuma trava no código — só o
 *     SOLO limitava salão.
 *   - "5.000 Tokens/mês" e "25.000 Tokens/mês" na tela admin, contra o 1.000.000
 *     e 5.000.000 que o worker de fato aplica para bloquear a IA.
 *
 * A regra passa a ser: nenhuma tela declara número de plano. Todas leem daqui.
 *
 * ## Duas armadilhas deste arquivo
 *
 * **Sem dependências, e imports relativos.** Este módulo é alcançado pelo grafo
 * de import do worker (`credits.service.ts` → `./plans`), que roda via `tsx` e
 * NÃO resolve o alias `@/`. O `tsc` não pega isso: quebra só em runtime, em
 * produção. Mesmo motivo pelo qual `money.utils.ts` também é sem dependências.
 *
 * **`Infinity` não sobrevive a JSON.** Os limites de ENTERPRISE são `Infinity`,
 * que vira `null` ao cruzar a fronteira RSC → client como prop serializada. Use
 * as funções deste módulo (`canAddSalon`, `formatLimit`, ...) no lado que precisa
 * da resposta, ou importe o catálogo direto no client — ele é código puro e entra
 * no bundle sem problema. Nunca serialize o número cru.
 *
 * Preço, limites e créditos aqui refletem as decisões do dono de 10/ago/2026,
 * registradas em docs/PLANOS-Diagnostico-e-Plano.md.
 */

import type { PlanTier } from "./types/salon"

/** Limite ausente. Ver a nota sobre JSON no topo do arquivo. */
export const UNLIMITED = Infinity

export interface PlanLimits {
  /** Salões que o dono pode criar na conta inteira. */
  readonly salons: number
  /**
   * Profissionais ativos POR SALÃO — não por conta.
   * `countActiveProfessionals` sempre contou por salão; quem tinha nome errado era
   * a constante: o antigo `PLAN_LIMITS` de `utils/permissions.ts` nunca limitou
   * salão, e foi esse nome que fez o comentário de `plan-features.service.ts` e a
   * mensagem do commit `1429b63` anunciarem "7 salões" no plano PRO.
   */
  readonly professionalsPerSalon: number
  /** Agentes de IA por salão. */
  readonly agents: number
  /**
   * Agentes já embutidos na mensalidade. Acima disso, ENTERPRISE é cobrado por
   * agente extra via item de assinatura no Stripe (`agent-billing.service.ts`).
   */
  readonly includedAgents: number
}

export interface PlanDefinition {
  readonly tier: PlanTier
  /** Como o plano se chama na tela. */
  readonly name: string
  /** Mensalidade em reais. `null` = sob consulta (ENTERPRISE). */
  readonly priceMonthlyBRL: number | null
  readonly limits: PlanLimits
  /** Teto mensal de créditos de IA. Acima dele o worker para de responder. */
  readonly monthlyCredits: number
  readonly description: string
  /** A lista de benefícios exibida ao usuário. Toda tela lê daqui. */
  readonly benefits: readonly string[]
}

/** Preço do agente adicional no ENTERPRISE, por mês. */
export const EXTRA_AGENT_PRICE_BRL = 150

/** Ordem de exibição e de upgrade — do mais barato ao mais caro. */
export const PLAN_ORDER: readonly PlanTier[] = ["SOLO", "PRO", "ENTERPRISE"] as const

export const PLANS: Record<PlanTier, PlanDefinition> = {
  SOLO: {
    tier: "SOLO",
    name: "Solo",
    priceMonthlyBRL: 299,
    limits: {
      salons: 1,
      professionalsPerSalon: 1,
      agents: 1,
      includedAgents: 1,
    },
    monthlyCredits: 1_000_000,
    description:
      "Ideal para profissionais autônomos que querem automatizar o atendimento.",
    benefits: [
      "1 salão",
      "1 profissional (você)",
      "1 agente de IA com WhatsApp",
      "Atendimento automatizado 24/7",
      "Agendamento inteligente",
      "1 milhão de créditos de IA por mês",
      "Suporte por e-mail",
    ],
  },

  PRO: {
    tier: "PRO",
    name: "Pro",
    priceMonthlyBRL: 999,
    limits: {
      salons: 3,
      professionalsPerSalon: 7,
      agents: 3,
      includedAgents: 3,
    },
    monthlyCredits: 5_000_000,
    description:
      "Para negócios em crescimento que precisam de mais capacidade e integração.",
    benefits: [
      "Até 3 salões",
      "Até 7 profissionais por salão",
      "3 agentes de IA, cada um com número próprio",
      "Atendimento automatizado 24/7",
      "Integrações avançadas",
      "Relatórios avançados",
      "5 milhões de créditos de IA por mês",
      "Suporte prioritário",
    ],
  },

  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    priceMonthlyBRL: null,
    limits: {
      salons: UNLIMITED,
      professionalsPerSalon: UNLIMITED,
      agents: UNLIMITED,
      includedAgents: 3,
    },
    monthlyCredits: 10_000_000,
    description: "Solução personalizada para redes e grandes operações.",
    benefits: [
      "Salões ilimitados",
      "Profissionais ilimitados",
      "3 agentes de IA inclusos",
      `Agentes adicionais por R$ ${EXTRA_AGENT_PRICE_BRL}/mês cada`,
      "10 milhões de créditos de IA por mês",
      "API dedicada",
      "Gerente de conta exclusivo",
      "SLA garantido",
    ],
  },
} as const

/**
 * O plano do tier, ou o SOLO quando o tier é desconhecido.
 *
 * Cair no SOLO é deliberado: é o plano MENOS permissivo. Um tier corrompido, o
 * `TEAM` fantasma que existiu em `salon-plan.service.ts`, ou um enum novo que
 * alguém adicione no banco sem passar por aqui — todos caem no mais restrito, em
 * vez de liberar limite pago por omissão.
 */
export function getPlan(tier: PlanTier | null | undefined): PlanDefinition {
  if (!tier) return PLANS.SOLO
  return PLANS[tier] ?? PLANS.SOLO
}

export function isUnlimited(limit: number): boolean {
  return !Number.isFinite(limit)
}

/** "3" ou "Ilimitado" — para nenhuma tela imprimir "Infinity". */
export function formatLimit(limit: number): string {
  return isUnlimited(limit) ? "Ilimitado" : String(limit)
}

/**
 * "R$ 299" ou "Sob consulta".
 *
 * Sem centavos de propósito: as mensalidades são valores redondos e a copy
 * aprovada é "R$ 299", não "R$ 299,00". Para valor de atendimento (que tem
 * centavos e vem do banco como string) use `formatBRL` de `utils/money.utils`.
 */
export function formatPlanPrice(tier: PlanTier | null | undefined): string {
  const price = getPlan(tier).priceMonthlyBRL
  return price === null ? "Sob consulta" : `R$ ${price.toLocaleString("pt-BR")}`
}

/** Pode criar mais um salão nesta conta? */
export function canAddSalon(tier: PlanTier | null | undefined, currentCount: number): boolean {
  return currentCount < getPlan(tier).limits.salons
}

/** Pode ativar mais um profissional NESTE salão? */
export function canAddProfessional(
  tier: PlanTier | null | undefined,
  currentCount: number
): boolean {
  return currentCount < getPlan(tier).limits.professionalsPerSalon
}

/** Pode criar mais um agente de IA neste salão? */
export function canAddAgent(tier: PlanTier | null | undefined, currentCount: number): boolean {
  return currentCount < getPlan(tier).limits.agents
}

/** Quantos agentes passam do que a mensalidade cobre — o que o Stripe cobra à parte. */
export function getExtraAgentCount(
  tier: PlanTier | null | undefined,
  agentCount: number
): number {
  const plan = getPlan(tier)
  // Só ENTERPRISE tem agente extra: nos outros o teto e o incluso são o mesmo
  // número, então passar do teto é impossível — `canAddAgent` já barrou.
  if (!isUnlimited(plan.limits.agents)) return 0
  return Math.max(0, agentCount - plan.limits.includedAgents)
}

/** Teto mensal de créditos de IA do plano. */
export function getMonthlyCredits(tier: PlanTier | null | undefined): number {
  return getPlan(tier).monthlyCredits
}
