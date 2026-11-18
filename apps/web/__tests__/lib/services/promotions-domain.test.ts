import { describe, it, expect } from "vitest"
import {
  applyCouponToSale,
  describeCouponDiscount,
  normalizeCouponCode,
  planPromotion,
  promotionBlocker,
  promotionDeleteBlocker,
  promotionStatus,
  splitCouponDiscount,
  weekdayOf,
  type CouponRule,
  type PromotionDraft,
} from "@repo/db/src/domain/promotions"
import { planSaleItems, type SaleCatalog } from "@repo/db/src/domain/sales"

/**
 * A regra das promoções e cupons, testada sem banco (docs/ROADMAP.md, fase 6,
 * fatia 6b).
 *
 * O que estes testes seguram: o desconto que a recepção dá com um código. O cupom
 * vale pelo DIA DA COMANDA, nunca desconta mais do que o item custa, não toca em
 * pacote nem em assinatura, e a soma repartida entre os itens é exata.
 */

const draft: PromotionDraft = {
  name: "  Terça da escova  ",
  code: " escova10 ",
  discountKind: "percent",
  discountValue: 10,
  appliesTo: "services",
  startsOn: "2026-11-01",
  endsOn: "2026-11-30",
  weekdays: [2, 2, 4],
  isActive: true,
}

describe("planPromotion", () => {
  it("normaliza nome, cupom e dias", () => {
    expect(planPromotion(draft)).toEqual({
      ok: true,
      promotion: {
        name: "Terça da escova",
        code: "ESCOVA10",
        discountKind: "percent",
        discountValue: "10.00",
        appliesTo: "services",
        startsOn: "2026-11-01",
        endsOn: "2026-11-30",
        weekdays: [2, 4],
        isActive: true,
      },
    })
  })

  it("os sete dias marcados viram 'todos os dias'", () => {
    const plan = planPromotion({ ...draft, weekdays: [0, 1, 2, 3, 4, 5, 6] })
    expect(plan.ok && plan.promotion.weekdays).toEqual([])
  })

  it("o cupom tem de 3 a 30 caracteres, sem acento nem espaço", () => {
    expect(planPromotion({ ...draft, code: "AB" }).ok).toBe(false)
    expect(planPromotion({ ...draft, code: "VERÃO10" }).ok).toBe(false)
    expect(planPromotion({ ...draft, code: "DIA DAS MAES" }).ok).toBe(false)
    expect(planPromotion({ ...draft, code: "   " })).toEqual({ ok: false, error: "Informe o cupom" })
    expect(planPromotion({ ...draft, code: "black-friday_26" }).ok).toBe(true)
  })

  it("desconto maior que zero; percentual até 100", () => {
    expect(planPromotion({ ...draft, discountValue: 0 }).ok).toBe(false)
    expect(planPromotion({ ...draft, discountValue: 100.01 })).toEqual({
      ok: false,
      error: "O desconto percentual vai até 100",
    })
    expect(planPromotion({ ...draft, discountKind: "fixed", discountValue: 150 }).ok).toBe(true)
  })

  it("vigência coerente e dias de 0 a 6", () => {
    expect(planPromotion({ ...draft, startsOn: "2026-12-01", endsOn: "2026-11-30" })).toEqual({
      ok: false,
      error: "O fim da vigência é antes do começo",
    })
    expect(planPromotion({ ...draft, startsOn: "2026-02-30" }).ok).toBe(false)
    expect(planPromotion({ ...draft, weekdays: [7] }).ok).toBe(false)
    expect(planPromotion({ ...draft, startsOn: null, endsOn: null, weekdays: [] }).ok).toBe(true)
  })
})

describe("normalizeCouponCode / promotionDeleteBlocker / describeCouponDiscount", () => {
  it("o cupom é comparado em maiúsculas, sem espaço nas pontas", () => {
    expect(normalizeCouponCode("  escova10 ")).toBe("ESCOVA10")
    expect(normalizeCouponCode(null)).toBe("")
  })

  it("promoção usada em comanda não se apaga", () => {
    expect(promotionDeleteBlocker({ sales: 0 })).toBeNull()
    expect(promotionDeleteBlocker({ sales: 1 })).toContain("Desative-a")
  })

  it("descreve o desconto", () => {
    expect(describeCouponDiscount({ discountKind: "percent", discountValue: "10.00" })).toBe("10%")
    expect(describeCouponDiscount({ discountKind: "percent", discountValue: "12.50" })).toBe("12,5%")
    expect(describeCouponDiscount({ discountKind: "fixed", discountValue: "25.00" })).toBe("R$ 25,00")
  })
})

describe("promotionBlocker", () => {
  // Novembro de 2026: dia 17 é terça (2), dia 18 é quarta (3).
  const promotion = { isActive: true, startsOn: "2026-11-10", endsOn: "2026-11-20", weekdays: [2] }

  it("confere o dia da semana pelo calendário", () => {
    expect(weekdayOf("2026-11-17")).toBe(2)
    expect(weekdayOf("2026-11-15")).toBe(0)
  })

  it("vale dentro da vigência, no dia certo, incluindo as pontas", () => {
    expect(promotionBlocker(promotion, "2026-11-17")).toBeNull()
    expect(promotionBlocker({ ...promotion, weekdays: [] }, "2026-11-10")).toBeNull()
    expect(promotionBlocker({ ...promotion, weekdays: [] }, "2026-11-20")).toBeNull()
  })

  it("antes, depois, no dia errado e desativada", () => {
    expect(promotionBlocker({ ...promotion, weekdays: [] }, "2026-11-09")).toBe(
      "Este cupom só vale a partir de 10/11/2026"
    )
    expect(promotionBlocker({ ...promotion, weekdays: [] }, "2026-11-21")).toBe("Este cupom valeu até 20/11/2026")
    expect(promotionBlocker(promotion, "2026-11-18")).toBe("Este cupom só vale em: terça")
    expect(promotionBlocker({ ...promotion, isActive: false }, "2026-11-17")).toBe("Este cupom está desativado")
  })

  it("sem vigência e sem dias, vale sempre", () => {
    expect(promotionBlocker({ isActive: true, startsOn: null, endsOn: null, weekdays: [] }, "2030-01-01")).toBeNull()
  })
})

describe("promotionStatus", () => {
  const promotion = { isActive: true, startsOn: "2026-11-10", endsOn: "2026-11-20", weekdays: [] }

  it("agendada, ativa, encerrada e desativada", () => {
    expect(promotionStatus(promotion, "2026-11-09")).toBe("scheduled")
    expect(promotionStatus(promotion, "2026-11-10")).toBe("active")
    expect(promotionStatus(promotion, "2026-11-20")).toBe("active")
    expect(promotionStatus(promotion, "2026-11-21")).toBe("expired")
    expect(promotionStatus({ ...promotion, isActive: false }, "2026-11-15")).toBe("inactive")
  })
})

describe("splitCouponDiscount", () => {
  const percent: CouponRule = { discountKind: "percent", discountValue: "10.00", appliesTo: "all" }
  const fixed: CouponRule = { discountKind: "fixed", discountValue: "50.00", appliesTo: "all" }

  it("percentual: sobre cada item que vale", () => {
    expect(
      splitCouponDiscount(percent, [
        { kind: "service", baseCents: 17000 },
        { kind: "product", baseCents: 6000 },
      ])
    ).toEqual([1700, 600])
  })

  it("só serviços ou só produtos", () => {
    const items = [
      { kind: "service", baseCents: 17000 },
      { kind: "product", baseCents: 6000 },
    ]
    expect(splitCouponDiscount({ ...percent, appliesTo: "services" }, items)).toEqual([1700, 0])
    expect(splitCouponDiscount({ ...percent, appliesTo: "products" }, items)).toEqual([0, 600])
  })

  it("pacote, assinatura e item do pacote ficam de fora", () => {
    expect(
      splitCouponDiscount(percent, [
        { kind: "package", baseCents: 43200 },
        { kind: "subscription", baseCents: 12000 },
        { kind: "service", baseCents: 0, fromPackage: true },
        { kind: "service", baseCents: 10000 },
      ])
    ).toEqual([0, 0, 0, 1000])
  })

  it("fixo: reparte na proporção, com a soma exata", () => {
    const shares = splitCouponDiscount(fixed, [
      { kind: "service", baseCents: 17000 },
      { kind: "product", baseCents: 6000 },
      { kind: "product", baseCents: 2000 },
    ])
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(5000)
    expect(shares).toEqual([3400, 1200, 400])
  })

  it("fixo com resto: o centavo que sobra vai para a maior fração", () => {
    const shares = splitCouponDiscount({ ...fixed, discountValue: "10.00" }, [
      { kind: "service", baseCents: 1000 },
      { kind: "service", baseCents: 1000 },
      { kind: "service", baseCents: 1000 },
    ])
    expect(shares).toEqual([334, 333, 333])
  })

  it("nunca desconta mais do que os itens custam", () => {
    expect(splitCouponDiscount(fixed, [{ kind: "service", baseCents: 3000 }])).toEqual([3000])
    expect(
      splitCouponDiscount({ ...percent, discountValue: "100.00" }, [{ kind: "service", baseCents: 3000 }])
    ).toEqual([3000])
  })

  it("sem item que valha, nada", () => {
    expect(splitCouponDiscount({ ...fixed, appliesTo: "products" }, [{ kind: "service", baseCents: 3000 }])).toEqual([0])
    expect(splitCouponDiscount(fixed, [])).toEqual([])
  })
})

describe("applyCouponToSale", () => {
  const catalog: SaleCatalog = {
    services: new Map([["svc-1", { name: "Corte" }]]),
    products: new Map([["prd-1", { name: "Shampoo" }]]),
    packageTemplates: new Map(),
    professionalIds: new Set(["pro-1"]),
    appointments: new Map(),
  }

  function plan() {
    const result = planSaleItems(
      "cus-1",
      [
        // R$ 170 com R$ 20 de desconto à mão.
        { kind: "service", serviceId: "svc-1", professionalId: "pro-1", quantity: 1, unitPrice: 170, discountAmount: 20 },
        { kind: "product", productId: "prd-1", quantity: 2, unitPrice: 30, discountAmount: 0 },
      ],
      catalog
    )
    if (!result.ok) throw new Error(result.error)
    return result
  }

  it("sem cupom, planSaleItems sai com o desconto do cupom zerado", () => {
    expect(plan().items.map((item) => item.couponDiscount)).toEqual(["0.00", "0.00"])
  })

  it("soma o cupom ao desconto à mão e refaz os totais", () => {
    const applied = applyCouponToSale({ discountKind: "percent", discountValue: "10.00", appliesTo: "all" }, plan())

    // Corte: (170 − 20) × 10% = 15. Shampoo: 60 × 10% = 6.
    expect(applied.items[0]).toMatchObject({ discountAmount: "35.00", couponDiscount: "15.00", total: "135.00" })
    expect(applied.items[1]).toMatchObject({ discountAmount: "6.00", couponDiscount: "6.00", total: "54.00" })
    expect(applied).toMatchObject({ subtotalCents: 23000, discountCents: 4100, couponCents: 2100, totalCents: 18900 })
  })

  it("cupom só de produto não mexe no serviço", () => {
    const applied = applyCouponToSale({ discountKind: "fixed", discountValue: "100.00", appliesTo: "products" }, plan())

    expect(applied.items[0]).toMatchObject({ discountAmount: "20.00", couponDiscount: "0.00", total: "150.00" })
    // R$ 100 de cupom, mas os produtos só custam R$ 60.
    expect(applied.items[1]).toMatchObject({ discountAmount: "60.00", couponDiscount: "60.00", total: "0.00" })
    expect(applied).toMatchObject({ couponCents: 6000, totalCents: 15000 })
  })

  it("o desconto do cupom nunca passa do desconto total do item", () => {
    const applied = applyCouponToSale({ discountKind: "percent", discountValue: "50.00", appliesTo: "all" }, plan())
    for (const item of applied.items) {
      expect(Number(item.couponDiscount)).toBeLessThanOrEqual(Number(item.discountAmount))
      expect(Number(item.total)).toBeGreaterThanOrEqual(0)
    }
  })
})
