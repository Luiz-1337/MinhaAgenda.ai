import { describe, it, expect } from "vitest"
import {
  cashbackForItem,
  cashbackReopenBlocker,
  cashbackStatus,
  effectiveCashbackRate,
  planCashbackAdjustment,
  planCashbackRedeem,
  planCashbackRule,
  planCashbackSettings,
  planSaleCashbackEarn,
  summarizeCashbackHistory,
  type CashbackRuleForItem,
  type CashbackSaleItem,
} from "@repo/db/src/domain/cashback"
import { planInvoice } from "@repo/db/src/domain/sales"

/**
 * A regra do cashback, testada sem banco (docs/ROADMAP.md, fase 6, fatia 6a).
 *
 * O que estes testes seguram: dinheiro que o salão promete ao cliente. O ganho
 * nunca passa do que foi cobrado, a parte paga com cashback não rende cashback, o
 * cliente não usa mais do que tem, e reabrir uma comanda não deixa saldo negativo.
 */

describe("planCashbackSettings", () => {
  it("normaliza a configuração", () => {
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "percent", defaultValue: 5, minRedeem: 20 })).toEqual({
      ok: true,
      settings: { isEnabled: true, defaultKind: "percent", defaultValue: "5.00", minRedeem: "20.00" },
    })
  })

  it("percentual vai de 0 a 100; valor fixo não tem esse teto", () => {
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "percent", defaultValue: 100, minRedeem: 0 }).ok).toBe(true)
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "percent", defaultValue: 100.01, minRedeem: 0 })).toEqual({
      ok: false,
      error: "O percentual de cashback vai de 0 a 100",
    })
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "fixed", defaultValue: 150, minRedeem: 0 }).ok).toBe(true)
  })

  it("recusa negativo e tipo inválido", () => {
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "percent", defaultValue: -1, minRedeem: 0 }).ok).toBe(false)
    expect(planCashbackSettings({ isEnabled: true, defaultKind: "percent", defaultValue: 5, minRedeem: -1 }).ok).toBe(false)
    expect(
      planCashbackSettings({ isEnabled: true, defaultKind: "outro" as never, defaultValue: 5, minRedeem: 0 }).ok
    ).toBe(false)
  })
})

describe("planCashbackRule", () => {
  it("aceita zero (usa o padrão) e inativo", () => {
    expect(planCashbackRule({ kind: "fixed", value: 0, isActive: false })).toEqual({
      ok: true,
      rule: { kind: "fixed", value: "0.00", isActive: false },
    })
    expect(planCashbackRule({ kind: "percent", value: 101, isActive: true }).ok).toBe(false)
  })
})

describe("effectiveCashbackRate", () => {
  const defaults = { kind: "percent" as const, value: "5.00" }

  it("a regra do item, com valor, vale mais que o padrão", () => {
    expect(effectiveCashbackRate(defaults, { kind: "fixed", value: "3.00", isActive: true })).toEqual({
      kind: "fixed",
      value: "3.00",
    })
  })

  it("regra com valor zero, ou sem regra, usa o padrão", () => {
    expect(effectiveCashbackRate(defaults, { kind: "fixed", value: "0.00", isActive: true })).toEqual(defaults)
    expect(effectiveCashbackRate(defaults, null)).toEqual(defaults)
  })

  it("regra inativa: o item não dá cashback, nem pelo padrão", () => {
    expect(effectiveCashbackRate(defaults, { kind: "percent", value: "10.00", isActive: false })).toBeNull()
  })

  it("sem regra e sem padrão, nada", () => {
    expect(effectiveCashbackRate({ kind: "percent", value: "0.00" }, null)).toBeNull()
  })
})

describe("cashbackForItem", () => {
  it("percentual sobre a base, ao centavo", () => {
    expect(cashbackForItem({ rate: { kind: "percent", value: "5.00" }, baseCents: 17000, quantity: 1 })).toBe(850)
    expect(cashbackForItem({ rate: { kind: "percent", value: "3.33" }, baseCents: 1000, quantity: 1 })).toBe(33)
  })

  it("fixo: por unidade, vezes a quantidade", () => {
    expect(cashbackForItem({ rate: { kind: "fixed", value: "2.00" }, baseCents: 9000, quantity: 3 })).toBe(600)
  })

  it("nunca mais do que foi cobrado", () => {
    expect(cashbackForItem({ rate: { kind: "fixed", value: "50.00" }, baseCents: 3000, quantity: 1 })).toBe(3000)
    expect(cashbackForItem({ rate: { kind: "percent", value: "100.00" }, baseCents: 3000, quantity: 1 })).toBe(3000)
  })

  it("item de graça ou sem taxa não rende", () => {
    expect(cashbackForItem({ rate: { kind: "fixed", value: "5.00" }, baseCents: 0, quantity: 1 })).toBe(0)
    expect(cashbackForItem({ rate: null, baseCents: 5000, quantity: 1 })).toBe(0)
  })
})

describe("planSaleCashbackEarn", () => {
  const defaults = { kind: "percent" as const, value: "10.00" }
  const noRules = new Map<string, CashbackRuleForItem>()

  const service: CashbackSaleItem = {
    id: "item-1",
    kind: "service",
    serviceId: "svc-1",
    productId: null,
    total: "100.00",
    quantity: "1.000",
  }
  const product: CashbackSaleItem = {
    id: "item-2",
    kind: "product",
    serviceId: null,
    productId: "prd-1",
    total: "60.00",
    quantity: "2.000",
  }

  it("cada item de serviço e de produto rende pelo padrão", () => {
    expect(
      planSaleCashbackEarn({
        defaults,
        items: [service, product],
        serviceRules: noRules,
        productRules: noRules,
        totalCents: 16000,
        redeemedCents: 0,
      })
    ).toEqual([
      { saleItemId: "item-1", amount: "10.00" },
      { saleItemId: "item-2", amount: "6.00" },
    ])
  })

  it("a regra do item sobrescreve o padrão, e a inativa zera", () => {
    const earned = planSaleCashbackEarn({
      defaults,
      items: [service, product],
      serviceRules: new Map([["svc-1", { kind: "percent", value: "20.00", isActive: true }]]),
      productRules: new Map([["prd-1", { kind: "fixed", value: "9.00", isActive: false }]]),
      totalCents: 16000,
      redeemedCents: 0,
    })
    expect(earned).toEqual([{ saleItemId: "item-1", amount: "20.00" }])
  })

  it("a parte paga com cashback não rende cashback", () => {
    // R$ 160 com R$ 40 de cashback: rende sobre 75% de cada item.
    expect(
      planSaleCashbackEarn({
        defaults,
        items: [service, product],
        serviceRules: noRules,
        productRules: noRules,
        totalCents: 16000,
        redeemedCents: 4000,
      })
    ).toEqual([
      { saleItemId: "item-1", amount: "7.50" },
      { saleItemId: "item-2", amount: "4.50" },
    ])
  })

  it("comanda toda paga com cashback não rende nada", () => {
    expect(
      planSaleCashbackEarn({
        defaults,
        items: [service],
        serviceRules: noRules,
        productRules: noRules,
        totalCents: 10000,
        redeemedCents: 10000,
      })
    ).toEqual([])
  })

  it("pacote, assinatura e item do pacote (que vale zero) não rendem", () => {
    expect(
      planSaleCashbackEarn({
        defaults,
        items: [
          { id: "a", kind: "package", serviceId: null, productId: null, total: "432.00", quantity: "1.000" },
          { id: "b", kind: "subscription", serviceId: null, productId: null, total: "120.00", quantity: "1.000" },
          { id: "c", kind: "service", serviceId: "svc-1", productId: null, total: "0.00", quantity: "1.000" },
        ],
        serviceRules: noRules,
        productRules: noRules,
        totalCents: 55200,
        redeemedCents: 0,
      })
    ).toEqual([])
  })
})

describe("cashbackStatus", () => {
  it("sem saldo, abaixo do mínimo e disponível", () => {
    expect(cashbackStatus({ balanceCents: 0, minRedeemCents: 2000 })).toBe("empty")
    expect(cashbackStatus({ balanceCents: 1999, minRedeemCents: 2000 })).toBe("below_minimum")
    expect(cashbackStatus({ balanceCents: 2000, minRedeemCents: 2000 })).toBe("available")
    expect(cashbackStatus({ balanceCents: 1, minRedeemCents: 0 })).toBe("available")
  })
})

describe("planCashbackRedeem", () => {
  const base = { enabled: true, balanceCents: 5000, minRedeemCents: 2000, totalCents: 17000 }

  it("sem pedido de uso, nada a conferir", () => {
    expect(planCashbackRedeem({ ...base, enabled: false, requested: 0 })).toEqual({ ok: true, redeemCents: 0 })
  })

  it("usa até o saldo", () => {
    expect(planCashbackRedeem({ ...base, requested: 50 })).toEqual({ ok: true, redeemCents: 5000 })
    expect(planCashbackRedeem({ ...base, requested: 50.01 })).toEqual({
      ok: false,
      error: "O cliente só tem R$ 50,00 de cashback",
    })
  })

  it("não usa mais do que o total da comanda", () => {
    expect(planCashbackRedeem({ ...base, balanceCents: 30000, requested: 170.01 })).toEqual({
      ok: false,
      error: "O cashback usado passa do total da comanda",
    })
    expect(planCashbackRedeem({ ...base, balanceCents: 30000, requested: 170 }).ok).toBe(true)
  })

  it("saldo abaixo do mínimo não resgata", () => {
    expect(planCashbackRedeem({ ...base, balanceCents: 1500, requested: 10 })).toEqual({
      ok: false,
      error: "O saldo de cashback (R$ 15,00) está abaixo do mínimo para resgate (R$ 20,00)",
    })
  })

  it("cashback desligado ou cliente sem saldo", () => {
    expect(planCashbackRedeem({ ...base, enabled: false, requested: 10 })).toEqual({
      ok: false,
      error: "O cashback não está ativo neste salão",
    })
    expect(planCashbackRedeem({ ...base, balanceCents: 0, requested: 10 })).toEqual({
      ok: false,
      error: "O cliente não tem saldo de cashback",
    })
    expect(planCashbackRedeem({ ...base, requested: -1 }).ok).toBe(false)
    expect(planCashbackRedeem({ ...base, requested: Number.NaN }).ok).toBe(false)
  })
})

describe("cashbackReopenBlocker", () => {
  it("reabre quando o saldo cobre o que a comanda gerou", () => {
    expect(cashbackReopenBlocker({ balanceCents: 1700, saleNetCents: 1700 })).toBeNull()
    expect(cashbackReopenBlocker({ balanceCents: 5000, saleNetCents: 1700 })).toBeNull()
  })

  it("barra quando o ganho já foi gasto em outra comanda", () => {
    expect(cashbackReopenBlocker({ balanceCents: 500, saleNetCents: 1700 })).toContain("já foi usado")
  })

  it("comanda que mais usou do que gerou sempre reabre: o saldo só sobe", () => {
    expect(cashbackReopenBlocker({ balanceCents: 0, saleNetCents: -2000 })).toBeNull()
  })
})

describe("planCashbackAdjustment", () => {
  it("credita e debita, com motivo", () => {
    expect(planCashbackAdjustment({ amount: 10, reason: "  Cortesia  ", balanceCents: 0 })).toEqual({
      ok: true,
      amount: "10.00",
      reason: "Cortesia",
    })
    expect(planCashbackAdjustment({ amount: -10, reason: "Estorno", balanceCents: 1000 })).toEqual({
      ok: true,
      amount: "-10.00",
      reason: "Estorno",
    })
  })

  it("não deixa o saldo negativo", () => {
    expect(planCashbackAdjustment({ amount: -10.01, reason: "Estorno", balanceCents: 1000 })).toEqual({
      ok: false,
      error: "O cliente só tem R$ 10,00 de cashback",
    })
  })

  it("exige valor e motivo", () => {
    expect(planCashbackAdjustment({ amount: 0, reason: "x", balanceCents: 0 }).ok).toBe(false)
    expect(planCashbackAdjustment({ amount: 10, reason: "   ", balanceCents: 0 })).toEqual({
      ok: false,
      error: "Informe o motivo do ajuste",
    })
    expect(planCashbackAdjustment({ amount: "abc", reason: "x", balanceCents: 0 }).ok).toBe(false)
  })
})

describe("planInvoice — parte coberta por cashback", () => {
  const now = new Date("2026-11-17T15:00:00-03:00")
  const methods = new Map([["pix", { feePercent: "0.00", settlementDays: 0, isActive: true }]])
  const items = [{ unitPrice: "170.00", total: "170.00", appointmentId: null }]
  const base = { items, methods, appointments: new Map(), now }

  it("pagamentos + cashback fecham o total", () => {
    const plan = planInvoice({ ...base, payments: [{ paymentMethodId: "pix", amount: 120 }], creditCents: 5000 })
    expect(plan).toMatchObject({ ok: true, totalCents: 17000, paidCents: 12000, creditCents: 5000, dueCents: 0 })
  })

  it("comanda toda paga com cashback fecha sem pagamento", () => {
    const plan = planInvoice({ ...base, payments: [], creditCents: 17000 })
    expect(plan).toMatchObject({ ok: true, paidCents: 0, creditCents: 17000, dueCents: 0 })
  })

  it("faltar ou passar continua sendo erro", () => {
    expect(planInvoice({ ...base, payments: [{ paymentMethodId: "pix", amount: 100 }], creditCents: 5000 })).toEqual({
      ok: false,
      error: "Faltam R$ 20,00 para fechar a comanda",
    })
    expect(planInvoice({ ...base, payments: [{ paymentMethodId: "pix", amount: 130 }], creditCents: 5000 })).toEqual({
      ok: false,
      error: "Os pagamentos e o cashback passam do total em R$ 10,00",
    })
    expect(planInvoice({ ...base, payments: [], creditCents: 17001 })).toEqual({
      ok: false,
      error: "O cashback usado passa do total da comanda",
    })
  })

  it("com fiado, o que fica em aberto desconta o cashback", () => {
    const plan = planInvoice({
      ...base,
      payments: [{ paymentMethodId: "pix", amount: 50 }],
      creditCents: 5000,
      allowDebt: true,
    })
    expect(plan).toMatchObject({ ok: true, dueCents: 7000 })
  })

  it("sem cashback, nada muda", () => {
    const plan = planInvoice({ ...base, payments: [{ paymentMethodId: "pix", amount: 170 }] })
    expect(plan).toMatchObject({ ok: true, creditCents: 0, dueCents: 0 })
    expect(planInvoice({ ...base, payments: [{ paymentMethodId: "pix", amount: 180 }] })).toEqual({
      ok: false,
      error: "Os pagamentos passam do total em R$ 10,00",
    })
  })
})

describe("summarizeCashbackHistory", () => {
  it("sem lançamento, tudo zerado", () => {
    expect(summarizeCashbackHistory([])).toEqual({
      earnedCents: 0,
      redeemedCents: 0,
      adjustmentCents: 0,
      netCents: 0,
      entries: 0,
    })
  })

  it("gerado e resgatado saem positivos; o ajuste mantém o sinal", () => {
    expect(
      summarizeCashbackHistory([
        { kind: "earn", total: "37.50", count: 4 },
        { kind: "redeem", total: "-12.00", count: 1 },
        { kind: "adjustment", total: "-5.50", count: 2 },
      ])
    ).toEqual({
      earnedCents: 3750,
      redeemedCents: 1200,
      adjustmentCents: -550,
      // 37,50 − 12,00 − 5,50
      netCents: 2000,
      entries: 7,
    })
  })

  it("a variação do saldo pode ser negativa: resgatou-se mais do que se gerou", () => {
    const summary = summarizeCashbackHistory([
      { kind: "earn", total: "10.00", count: 1 },
      { kind: "redeem", total: "-30.00", count: 2 },
    ])
    expect(summary.netCents).toBe(-2000)
  })
})
