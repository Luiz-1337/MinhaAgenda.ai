import { describe, it, expect } from "vitest"
import {
  customerSubscriptionDeleteBlocker,
  customerSubscriptionStatus,
  nextSubscriptionPeriod,
  planCustomerSubscription,
  planSubscriptionPeriods,
  planSubscriptionPlan,
  subscriptionPlanDeleteBlocker,
  subscriptionReopenBlocker,
  type SubscriptionForRenewal,
  type SubscriptionPlanDraft,
} from "@repo/db/src/domain/subscriptions"
import { planSaleItems, type SaleCatalog, type SaleItemDraft } from "@repo/db/src/domain/sales"

/**
 * A regra das assinaturas de cliente, testada sem banco (docs/ROADMAP.md, fase 5,
 * fatia 5c).
 *
 * O que estes testes seguram: até quando o cliente pagou. Cada cobrança faturada
 * paga UM período; quem renova em dia não perde dias, quem renova atrasado não
 * paga pelo tempo em que ficou sem; e a situação sai dos períodos, não de um
 * campo que alguém esquece de atualizar.
 */

const planDraft: SubscriptionPlanDraft = {
  name: "  Clube de escova  ",
  description: "",
  price: 120,
  intervalMonths: 1,
  isActive: true,
  isVisible: false,
}

describe("planSubscriptionPlan", () => {
  it("normaliza o plano", () => {
    const plan = planSubscriptionPlan(planDraft)
    expect(plan).toEqual({
      ok: true,
      plan: {
        name: "Clube de escova",
        description: null,
        price: "120.00",
        intervalMonths: 1,
        isActive: true,
        isVisible: false,
      },
    })
  })

  it("exige nome", () => {
    expect(planSubscriptionPlan({ ...planDraft, name: "   " })).toEqual({
      ok: false,
      error: "Informe o nome do plano",
    })
  })

  it("plano de graça não existe: renovar é cobrar", () => {
    expect(planSubscriptionPlan({ ...planDraft, price: 0 })).toEqual({
      ok: false,
      error: "Informe o valor do plano",
    })
    expect(planSubscriptionPlan({ ...planDraft, price: -1 }).ok).toBe(false)
    expect(planSubscriptionPlan({ ...planDraft, price: Number.NaN }).ok).toBe(false)
  })

  it("a periodicidade é em meses inteiros, de 1 a 36", () => {
    expect(planSubscriptionPlan({ ...planDraft, intervalMonths: 12 }).ok).toBe(true)
    expect(planSubscriptionPlan({ ...planDraft, intervalMonths: 36 }).ok).toBe(true)
    expect(planSubscriptionPlan({ ...planDraft, intervalMonths: 0 }).ok).toBe(false)
    expect(planSubscriptionPlan({ ...planDraft, intervalMonths: 37 }).ok).toBe(false)
    expect(planSubscriptionPlan({ ...planDraft, intervalMonths: 1.5 }).ok).toBe(false)
  })
})

describe("subscriptionPlanDeleteBlocker", () => {
  it("plano sem assinatura pode sair; com assinatura, desativa-se", () => {
    expect(subscriptionPlanDeleteBlocker({ subscriptions: 0 })).toBeNull()
    expect(subscriptionPlanDeleteBlocker({ subscriptions: 1 })).toBe(
      "Este plano já tem assinatura. Desative-o em vez de excluir"
    )
  })
})

describe("planCustomerSubscription", () => {
  const plan = { name: "Clube de escova", price: "120.00", intervalMonths: 1, isActive: true }
  // 22h de 17/nov em Brasília já é dia 18 em UTC.
  const now = new Date("2026-11-18T01:00:00Z")

  it("copia o plano e começa no dia de Brasília", () => {
    expect(planCustomerSubscription({ plan, alreadySubscribed: false, now })).toEqual({
      ok: true,
      subscription: { name: "Clube de escova", price: "120.00", intervalMonths: 1, startedOn: "2026-11-17" },
    })
  })

  it("plano que não existe, inativo ou já assinado", () => {
    expect(planCustomerSubscription({ plan: null, alreadySubscribed: false, now })).toEqual({
      ok: false,
      error: "Plano não encontrado",
    })
    expect(planCustomerSubscription({ plan: { ...plan, isActive: false }, alreadySubscribed: false, now })).toEqual({
      ok: false,
      error: "Este plano está inativo",
    })
    expect(planCustomerSubscription({ plan, alreadySubscribed: true, now })).toEqual({
      ok: false,
      error: "O cliente já tem uma assinatura deste plano",
    })
  })
})

describe("customerSubscriptionDeleteBlocker", () => {
  it("só sai a que nunca foi cobrada e não está em comanda", () => {
    expect(customerSubscriptionDeleteBlocker({ periods: 0, saleItems: 0 })).toBeNull()
    expect(customerSubscriptionDeleteBlocker({ periods: 1, saleItems: 1 })).toContain("já foi cobrada")
    expect(customerSubscriptionDeleteBlocker({ periods: 0, saleItems: 1 })).toContain("está em uma comanda")
  })
})

describe("customerSubscriptionStatus", () => {
  const today = "2026-11-17"

  it("sem período pago é pendente", () => {
    expect(customerSubscriptionStatus({ deactivated: false, paidUntil: null, today })).toBe("pending")
  })

  it("vale até o dia do vencimento, inclusive", () => {
    expect(customerSubscriptionStatus({ deactivated: false, paidUntil: "2026-12-17", today })).toBe("active")
    expect(customerSubscriptionStatus({ deactivated: false, paidUntil: "2026-11-17", today })).toBe("active")
    expect(customerSubscriptionStatus({ deactivated: false, paidUntil: "2026-11-16", today })).toBe("expired")
  })

  it("desativada vale mais que qualquer outra", () => {
    expect(customerSubscriptionStatus({ deactivated: true, paidUntil: "2026-12-17", today })).toBe("inactive")
    expect(customerSubscriptionStatus({ deactivated: true, paidUntil: null, today })).toBe("inactive")
  })
})

describe("nextSubscriptionPeriod", () => {
  it("a primeira cobrança começa no dia da comanda", () => {
    expect(nextSubscriptionPeriod({ saleDay: "2026-11-17", paidUntil: null, intervalMonths: 1 })).toEqual({
      periodStart: "2026-11-17",
      periodEnd: "2026-12-17",
    })
  })

  it("renovar em dia emenda no vencimento: quem paga adiantado não perde dias", () => {
    expect(nextSubscriptionPeriod({ saleDay: "2026-12-10", paidUntil: "2026-12-17", intervalMonths: 1 })).toEqual({
      periodStart: "2026-12-17",
      periodEnd: "2027-01-17",
    })
    // No próprio dia do vencimento ainda está em dia.
    expect(nextSubscriptionPeriod({ saleDay: "2026-12-17", paidUntil: "2026-12-17", intervalMonths: 1 })).toEqual({
      periodStart: "2026-12-17",
      periodEnd: "2027-01-17",
    })
  })

  it("renovar atrasado começa no dia da comanda: não paga pelo tempo sem assinatura", () => {
    expect(nextSubscriptionPeriod({ saleDay: "2027-02-03", paidUntil: "2026-12-17", intervalMonths: 1 })).toEqual({
      periodStart: "2027-02-03",
      periodEnd: "2027-03-03",
    })
  })

  it("respeita a periodicidade e o fim do mês", () => {
    expect(nextSubscriptionPeriod({ saleDay: "2026-11-17", paidUntil: null, intervalMonths: 12 })).toEqual({
      periodStart: "2026-11-17",
      periodEnd: "2027-11-17",
    })
    expect(nextSubscriptionPeriod({ saleDay: "2027-01-31", paidUntil: null, intervalMonths: 1 })).toEqual({
      periodStart: "2027-01-31",
      periodEnd: "2027-02-28",
    })
  })
})

describe("planSubscriptionPeriods", () => {
  const saleDate = new Date("2026-11-17T15:00:00-03:00")

  function subscriptions(change: Partial<SubscriptionForRenewal> = {}) {
    return new Map<string, SubscriptionForRenewal>([
      ["sub-1", { name: "Clube de escova", intervalMonths: 1, deactivated: false, paidUntil: null, ...change }],
    ])
  }

  it("um item de assinatura paga um período, pelo total do item", () => {
    const plan = planSubscriptionPeriods({
      saleDate,
      items: [{ id: "item-1", customerSubscriptionId: "sub-1", total: "110.00" }],
      subscriptions: subscriptions(),
    })
    expect(plan).toEqual({
      ok: true,
      periods: [
        {
          saleItemId: "item-1",
          subscriptionId: "sub-1",
          periodStart: "2026-11-17",
          periodEnd: "2026-12-17",
          amount: "110.00",
        },
      ],
    })
  })

  it("o dia da comanda é o de Brasília", () => {
    const plan = planSubscriptionPeriods({
      saleDate: new Date("2026-11-18T01:00:00Z"),
      items: [{ id: "item-1", customerSubscriptionId: "sub-1", total: "120.00" }],
      subscriptions: subscriptions(),
    })
    expect(plan.ok && plan.periods[0].periodStart).toBe("2026-11-17")
  })

  it("emenda no vencimento do período já pago por outra comanda", () => {
    const plan = planSubscriptionPeriods({
      saleDate,
      items: [{ id: "item-1", customerSubscriptionId: "sub-1", total: "120.00" }],
      subscriptions: subscriptions({ paidUntil: "2026-11-30" }),
    })
    expect(plan.ok && plan.periods[0]).toMatchObject({ periodStart: "2026-11-30", periodEnd: "2026-12-30" })
  })

  it("item que não é de assinatura não gera período", () => {
    expect(
      planSubscriptionPeriods({
        saleDate,
        items: [{ id: "item-1", customerSubscriptionId: null, total: "50.00" }],
        subscriptions: subscriptions(),
      })
    ).toEqual({ ok: true, periods: [] })
  })

  it("assinatura desativada barra o faturamento", () => {
    expect(
      planSubscriptionPeriods({
        saleDate,
        items: [{ id: "item-1", customerSubscriptionId: "sub-1", total: "120.00" }],
        subscriptions: subscriptions({ deactivated: true }),
      })
    ).toEqual({
      ok: false,
      error: 'A assinatura "Clube de escova" foi desativada. Tire o item da comanda para faturar',
    })
  })

  it("assinatura que sumiu ou repetida na comanda é erro", () => {
    expect(
      planSubscriptionPeriods({
        saleDate,
        items: [{ id: "item-1", customerSubscriptionId: "sub-x", total: "120.00" }],
        subscriptions: subscriptions(),
      }).ok
    ).toBe(false)
    expect(
      planSubscriptionPeriods({
        saleDate,
        items: [
          { id: "item-1", customerSubscriptionId: "sub-1", total: "120.00" },
          { id: "item-2", customerSubscriptionId: "sub-1", total: "120.00" },
        ],
        subscriptions: subscriptions(),
      }).ok
    ).toBe(false)
  })
})

describe("subscriptionReopenBlocker", () => {
  it("só a última renovação reabre", () => {
    expect(subscriptionReopenBlocker([])).toBeNull()
    expect(subscriptionReopenBlocker([{ name: "Clube de escova", saleNumber: 21 }])).toBe(
      'A assinatura "Clube de escova" já foi renovada depois, na comanda #21. Reabra aquela antes desta'
    )
  })
})

describe("planSaleItems — item de assinatura", () => {
  const catalog: SaleCatalog = {
    services: new Map(),
    products: new Map(),
    packageTemplates: new Map(),
    professionalIds: new Set(["pro-1"]),
    appointments: new Map(),
    subscriptions: new Map([
      ["sub-1", { name: "Clube de escova", customerId: "cus-1", deactivated: false }],
      ["sub-2", { name: "Clube de corte", customerId: "cus-1", deactivated: true }],
      ["sub-3", { name: "Clube de barba", customerId: "cus-2", deactivated: false }],
    ]),
  }

  const charge: SaleItemDraft = {
    kind: "subscription",
    customerSubscriptionId: "sub-1",
    quantity: 1,
    unitPrice: 120,
    discountAmount: 10,
  }

  it("cobra a assinatura do cliente, com valor e desconto livres e vendedor opcional", () => {
    const plan = planSaleItems("cus-1", [{ ...charge, professionalId: "pro-1" }], catalog)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.totalCents).toBe(11000)
    expect(plan.items[0]).toMatchObject({
      kind: "subscription",
      customerSubscriptionId: "sub-1",
      description: "Assinatura: Clube de escova",
      serviceId: null,
      productId: null,
      packageTemplateId: null,
      professionalId: "pro-1",
      quantity: "1.000",
      total: "110.00",
    })
  })

  it("assinatura que não existe (ou com o módulo desligado) é recusada", () => {
    expect(planSaleItems("cus-1", [{ ...charge, customerSubscriptionId: "sub-x" }], catalog)).toEqual({
      ok: false,
      error: "Item 1: assinatura não encontrada",
    })
    expect(planSaleItems("cus-1", [charge], { ...catalog, subscriptions: undefined }).ok).toBe(false)
  })

  it("assinatura de outro cliente ou desativada é recusada", () => {
    expect(planSaleItems("cus-1", [{ ...charge, customerSubscriptionId: "sub-3" }], catalog)).toEqual({
      ok: false,
      error: "Item 1: a assinatura é de outro cliente",
    })
    expect(planSaleItems("cus-1", [{ ...charge, customerSubscriptionId: "sub-2" }], catalog)).toEqual({
      ok: false,
      error: 'Item 1: a assinatura "Clube de corte" está desativada',
    })
  })

  it("uma cobrança por assinatura em cada comanda, com quantidade 1", () => {
    expect(planSaleItems("cus-1", [charge, charge], catalog)).toEqual({
      ok: false,
      error: "Item 2: a mesma assinatura aparece em dois itens",
    })
    expect(planSaleItems("cus-1", [{ ...charge, quantity: 2 }], catalog)).toEqual({
      ok: false,
      error: "Item 1: assinatura vai com quantidade 1",
    })
  })

  it("assinatura não sai de pacote, não tem auxiliar nem agendamento", () => {
    expect(planSaleItems("cus-1", [{ ...charge, customerPackageItemId: "line-1" }], catalog)).toEqual({
      ok: false,
      error: "Item 1: assinatura não sai de pacote",
    })
    expect(planSaleItems("cus-1", [{ ...charge, assistantId: "pro-1" }], catalog).ok).toBe(false)
    expect(planSaleItems("cus-1", [{ ...charge, appointmentId: "apt-1" }], catalog).ok).toBe(false)
  })

  it("os outros itens da comanda saem sem assinatura", () => {
    const withService: SaleCatalog = { ...catalog, services: new Map([["svc-1", { name: "Escova" }]]) }
    const plan = planSaleItems(
      "cus-1",
      [{ kind: "service", serviceId: "svc-1", professionalId: "pro-1", quantity: 1, unitPrice: 50, discountAmount: 0 }, charge],
      withService
    )
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.items.map((item) => item.customerSubscriptionId)).toEqual([null, "sub-1"])
    expect(plan.totalCents).toBe(16000)
  })
})
