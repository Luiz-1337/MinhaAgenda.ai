import { describe, it, expect } from "vitest"
import {
  PLANS,
  PLAN_ORDER,
  EXTRA_AGENT_PRICE_BRL,
  getPlan,
  isUnlimited,
  formatLimit,
  formatPlanPrice,
  canAddSalon,
  canAddProfessional,
  canAddAgent,
  getExtraAgentCount,
  getMonthlyCredits,
} from "@/lib/plans"

/**
 * Catálogo de planos — fonte única.
 *
 * O que este arquivo protege é de duas classes de erro que já aconteceram:
 *
 * 1. **Número divergindo entre lugares.** Antes do catálogo, "Até 3 Salões" era
 *    vendido em três telas sem nenhuma trava no código, e a tela admin anunciava
 *    "25.000 Tokens/mês" contra os 5.000.000 que o worker de fato aplicava.
 *
 * 2. **Liberar plano pago por omissão.** Todo caminho de tier ausente ou
 *    desconhecido tem que cair no plano MENOS permissivo, nunca no mais.
 */

describe("valores decididos pelo dono (10/ago/2026)", () => {
  it("SOLO: 1 salão, 1 profissional, 1 agente, 1 milhão de créditos, R$ 299", () => {
    expect(PLANS.SOLO.limits.salons).toBe(1)
    expect(PLANS.SOLO.limits.professionalsPerSalon).toBe(1)
    expect(PLANS.SOLO.limits.agents).toBe(1)
    expect(PLANS.SOLO.monthlyCredits).toBe(1_000_000)
    expect(PLANS.SOLO.priceMonthlyBRL).toBe(299)
  })

  it("PRO: 3 SALÕES e 7 PROFISSIONAIS — não 7 salões", () => {
    // Este é o achado que originou o catálogo. `PLAN_LIMITS.PRO = 7` sempre foi
    // teto de profissionais por salão, mas o nome da constante fez o comentário de
    // plan-features.service.ts e a mensagem do commit 1429b63 anunciarem "7 salões".
    // Enquanto isso o código não limitava salão nenhum no PRO.
    expect(PLANS.PRO.limits.salons).toBe(3)
    expect(PLANS.PRO.limits.professionalsPerSalon).toBe(7)
    expect(PLANS.PRO.limits.agents).toBe(3)
    expect(PLANS.PRO.monthlyCredits).toBe(5_000_000)
    expect(PLANS.PRO.priceMonthlyBRL).toBe(999)
  })

  it("ENTERPRISE: salões e profissionais ilimitados, 3 agentes inclusos, sob consulta", () => {
    expect(isUnlimited(PLANS.ENTERPRISE.limits.salons)).toBe(true)
    expect(isUnlimited(PLANS.ENTERPRISE.limits.professionalsPerSalon)).toBe(true)
    expect(isUnlimited(PLANS.ENTERPRISE.limits.agents)).toBe(true)
    expect(PLANS.ENTERPRISE.limits.includedAgents).toBe(3)
    expect(PLANS.ENTERPRISE.monthlyCredits).toBe(10_000_000)
    expect(PLANS.ENTERPRISE.priceMonthlyBRL).toBeNull()
    expect(EXTRA_AGENT_PRICE_BRL).toBe(150)
  })
})

describe("tier ausente ou desconhecido cai no MENOS permissivo", () => {
  // Um catálogo que libera por omissão entrega plano pago de graça. Todo caminho
  // de entrada suja tem que terminar no SOLO.
  const sujos = [null, undefined, "TEAM", "", "pro", "ENTERPRISE " ] as const

  it.each(sujos)("getPlan(%o) devolve o plano SOLO", (tier) => {
    expect(getPlan(tier as never).tier).toBe("SOLO")
  })

  it("os limites do tier fantasma TEAM são os do SOLO, não os do ENTERPRISE", () => {
    // `salon-plan.service.ts` declarava `SalonTier = "SOLO" | "TEAM" | "ENTERPRISE"`.
    // Se esse valor vazar para cá, tem que restringir — não liberar.
    expect(canAddSalon("TEAM" as never, 1)).toBe(false)
    expect(canAddProfessional("TEAM" as never, 1)).toBe(false)
    expect(canAddAgent("TEAM" as never, 1)).toBe(false)
    expect(getMonthlyCredits("TEAM" as never)).toBe(1_000_000)
  })
})

describe("canAddSalon", () => {
  it("SOLO trava no segundo salão", () => {
    expect(canAddSalon("SOLO", 0)).toBe(true)
    expect(canAddSalon("SOLO", 1)).toBe(false)
  })

  it("PRO vai até 3 e trava no quarto", () => {
    // Antes do catálogo não existia trava nenhuma de salão fora do SOLO: PRO e
    // ENTERPRISE criavam quantos quisessem, com três telas prometendo "Até 3".
    expect(canAddSalon("PRO", 2)).toBe(true)
    expect(canAddSalon("PRO", 3)).toBe(false)
  })

  it("ENTERPRISE não trava", () => {
    expect(canAddSalon("ENTERPRISE", 9_999)).toBe(true)
  })
})

describe("canAddProfessional (por salão, não por conta)", () => {
  it("SOLO só permite o dono", () => {
    expect(canAddProfessional("SOLO", 0)).toBe(true)
    expect(canAddProfessional("SOLO", 1)).toBe(false)
  })

  it("PRO vai até 7 e trava no oitavo", () => {
    expect(canAddProfessional("PRO", 6)).toBe(true)
    expect(canAddProfessional("PRO", 7)).toBe(false)
  })

  it("ENTERPRISE não trava", () => {
    expect(canAddProfessional("ENTERPRISE", 500)).toBe(true)
  })
})

describe("canAddAgent", () => {
  it("SOLO 1, PRO 3, ENTERPRISE sem teto", () => {
    expect(canAddAgent("SOLO", 1)).toBe(false)
    expect(canAddAgent("PRO", 2)).toBe(true)
    expect(canAddAgent("PRO", 3)).toBe(false)
    expect(canAddAgent("ENTERPRISE", 42)).toBe(true)
  })
})

describe("getExtraAgentCount — o que o Stripe cobra à parte", () => {
  it("só ENTERPRISE tem agente extra", () => {
    // Nos outros planos o teto e o incluso são o mesmo número, então passar do
    // incluso é impossível: canAddAgent já barrou antes.
    expect(getExtraAgentCount("SOLO", 5)).toBe(0)
    expect(getExtraAgentCount("PRO", 5)).toBe(0)
  })

  it("ENTERPRISE cobra a partir do quarto agente", () => {
    expect(getExtraAgentCount("ENTERPRISE", 3)).toBe(0)
    expect(getExtraAgentCount("ENTERPRISE", 4)).toBe(1)
    expect(getExtraAgentCount("ENTERPRISE", 7)).toBe(4)
  })

  it("nunca devolve negativo", () => {
    expect(getExtraAgentCount("ENTERPRISE", 0)).toBe(0)
  })

  it("tier desconhecido não gera cobrança de extra", () => {
    expect(getExtraAgentCount(null, 10)).toBe(0)
  })
})

describe("formatação para tela", () => {
  it("formatLimit nunca imprime Infinity", () => {
    expect(formatLimit(3)).toBe("3")
    expect(formatLimit(Infinity)).toBe("Ilimitado")
  })

  it("formatPlanPrice usa a copy aprovada, sem centavos", () => {
    expect(formatPlanPrice("SOLO")).toBe("R$ 299")
    expect(formatPlanPrice("PRO")).toBe("R$ 999")
    expect(formatPlanPrice("ENTERPRISE")).toBe("Sob consulta")
  })

  it("preço de tier inválido não vira 'R$ NaN' nem 'undefined'", () => {
    expect(formatPlanPrice(null)).toBe("R$ 299")
  })
})

describe("consistência interna do catálogo", () => {
  it("todo tier de PLAN_ORDER existe e aponta para si mesmo", () => {
    for (const tier of PLAN_ORDER) {
      expect(PLANS[tier]).toBeDefined()
      expect(PLANS[tier].tier).toBe(tier)
    }
  })

  it("PLAN_ORDER cobre o enum inteiro do banco", () => {
    // subscription_tier em packages/db/src/schema.ts. Um tier novo no banco sem
    // entrada aqui cairia silenciosamente no SOLO via getPlan.
    expect([...PLAN_ORDER].sort()).toEqual(["ENTERPRISE", "PRO", "SOLO"])
  })

  it("nenhum plano inclui mais agentes do que o próprio teto permite", () => {
    for (const tier of PLAN_ORDER) {
      const { agents, includedAgents } = PLANS[tier].limits
      expect(includedAgents).toBeLessThanOrEqual(agents)
    }
  })

  it("preço e créditos crescem junto com o plano", () => {
    expect(PLANS.SOLO.monthlyCredits).toBeLessThan(PLANS.PRO.monthlyCredits)
    expect(PLANS.PRO.monthlyCredits).toBeLessThan(PLANS.ENTERPRISE.monthlyCredits)
    expect(PLANS.SOLO.priceMonthlyBRL!).toBeLessThan(PLANS.PRO.priceMonthlyBRL!)
  })

  it("todo plano tem benefícios para a tela exibir", () => {
    for (const tier of PLAN_ORDER) {
      expect(PLANS[tier].benefits.length).toBeGreaterThan(0)
    }
  })
})
