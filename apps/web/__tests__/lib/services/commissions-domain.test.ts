import { describe, it, expect } from "vitest"
import {
  DEFAULT_COMMISSION_SETTINGS,
  commissionTotals,
  parseCommissionRate,
  planCommissionRule,
  planSaleCommissions,
  resolveCommissionRate,
  resolveCommissionSettings,
  type CommissionSaleInput,
} from "@repo/db/src/domain/commissions"

/**
 * A regra de comissão, testada sem banco (docs/ROADMAP.md, fase 3, fatia 3a).
 *
 * O que estes testes seguram: a conta que vira dinheiro no bolso do profissional.
 * Os dois primeiros casos de `planSaleCommissions` são os números que a auditoria
 * da Belasis conferiu sobre dados reais (RN-COM) — se eles mudarem, o extrato
 * deixa de bater com o sistema que o salão usa hoje.
 */

const PRO = "pro-1"
const SERVICE = "svc-1"
const PRODUCT = "prd-1"

/** Comanda de um item de serviço, paga inteira, 50% de comissão geral. */
function sale(overrides: Partial<CommissionSaleInput> = {}): CommissionSaleInput {
  return {
    // 16/nov/2026 às 22h de Brasília = 17/nov 01h UTC.
    sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "200.00", amountDue: "0.00" },
    items: [
      { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "0.00", total: "200.00" },
    ],
    payments: [{ feeAmount: "5.84", settlesOn: "2026-12-16" }],
    salonSettings: null,
    professionals: new Map([[PRO, { commissionRate: "50.00", settings: null }]]),
    rules: [],
    ...overrides,
  }
}

describe("regras gerais: salão e exceção por profissional", () => {
  it("sem nada gravado vale o padrão do sistema", () => {
    expect(resolveCommissionSettings(null)).toEqual(DEFAULT_COMMISSION_SETTINGS)
    expect(DEFAULT_COMMISSION_SETTINGS).toEqual({
      dateBasis: "competence",
      feeMode: "proportional",
      discountMode: "salon",
    })
  })

  it("o profissional sobrescreve campo a campo; o resto segue o salão", () => {
    const settings = resolveCommissionSettings(
      { dateBasis: "availability", feeMode: "salon", discountMode: null },
      { dateBasis: null, feeMode: "professional", discountMode: null }
    )
    expect(settings).toEqual({ dateBasis: "availability", feeMode: "professional", discountMode: "salon" })
  })

  it("valor desconhecido no banco cai para o próximo nível em vez de quebrar", () => {
    const settings = resolveCommissionSettings(
      { dateBasis: "availability", feeMode: "lixo", discountMode: 42 },
      { dateBasis: "outro lixo", feeMode: null, discountMode: null }
    )
    expect(settings).toEqual({ dateBasis: "availability", feeMode: "proportional", discountMode: "salon" })
  })
})

describe("qual regra vale para o item", () => {
  it("exceção do profissional > padrão do salão > percentual geral > zero", () => {
    const own = { kind: "percent" as const, value: "60.00" }
    const shared = { kind: "fixed" as const, value: "15.00" }

    expect(resolveCommissionRate({ professionalRule: own, salonRule: shared, professionalDefaultPercent: "40" })).toEqual({
      rate: { kind: "percent", basisPoints: 6000 },
      source: "professional_item",
    })
    expect(resolveCommissionRate({ salonRule: shared, professionalDefaultPercent: "40" })).toEqual({
      rate: { kind: "fixed", cents: 1500 },
      source: "salon_item",
    })
    expect(resolveCommissionRate({ professionalDefaultPercent: "40" })).toEqual({
      rate: { kind: "percent", basisPoints: 4000 },
      source: "professional_default",
    })
    expect(resolveCommissionRate({ professionalDefaultPercent: "0.00" })).toEqual({
      rate: { kind: "percent", basisPoints: 0 },
      source: "none",
    })
  })

  it("regra de 0% é uma regra: zera a comissão mesmo com percentual geral", () => {
    const zero = { kind: "percent" as const, value: "0.00" }
    expect(resolveCommissionRate({ salonRule: zero, professionalDefaultPercent: "50" }).source).toBe("salon_item")
    expect(resolveCommissionRate({ salonRule: zero, professionalDefaultPercent: "50" }).rate).toEqual({
      kind: "percent",
      basisPoints: 0,
    })
  })

  it("regra inválida é ignorada", () => {
    expect(parseCommissionRate({ kind: "percent", value: "101" })).toBeNull()
    expect(parseCommissionRate({ kind: "percent", value: "-1" })).toBeNull()
    expect(parseCommissionRate({ kind: "fixed", value: "abc" })).toBeNull()
    expect(parseCommissionRate(null)).toBeNull()
  })
})

describe("validação da regra vinda do formulário", () => {
  it("aceita percentual e valor fixo e devolve o que gravar", () => {
    expect(planCommissionRule({ kind: "percent", value: 33.33 })).toEqual({ ok: true, kind: "percent", value: "33.33" })
    expect(planCommissionRule({ kind: "fixed", value: 12.5 })).toEqual({ ok: true, kind: "fixed", value: "12.50" })
    expect(planCommissionRule({ kind: "percent", value: 0 })).toEqual({ ok: true, kind: "percent", value: "0.00" })
  })

  it("recusa tipo desconhecido, negativo e percentual acima de 100", () => {
    expect(planCommissionRule({ kind: "outro", value: 10 }).ok).toBe(false)
    expect(planCommissionRule({ kind: "percent", value: -1 }).ok).toBe(false)
    expect(planCommissionRule({ kind: "percent", value: 100.01 }).ok).toBe(false)
    expect(planCommissionRule({ kind: "fixed", value: Number.NaN }).ok).toBe(false)
    expect(planCommissionRule({ kind: "fixed", value: "10" }).ok).toBe(false)
  })
})

describe("cálculo da comissão — números conferidos na auditoria (RN-COM)", () => {
  it("item de R$ 200, 50%, taxa de 2,92%: R$ 2,92 de taxa e R$ 97,08 disponível", () => {
    const [entry] = planSaleCommissions(sale())

    expect(entry).toMatchObject({
      saleItemId: "item-1",
      professionalId: PRO,
      role: "professional",
      baseAmount: "200.00",
      rateKind: "percent",
      rateValue: "50.00",
      grossAmount: "100.00",
      feeAmount: "2.92",
      amount: "97.08",
    })
  })

  it("item de R$ 600, 50%, taxa de 2,92%: R$ 8,76 de taxa e R$ 291,24 antes do auxiliar", () => {
    const [entry] = planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-16T15:00:00Z"), total: "600.00", amountDue: "0.00" },
        items: [
          { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "0.00", total: "600.00" },
        ],
        payments: [{ feeAmount: "17.52", settlesOn: "2026-12-16" }],
      })
    )

    expect(entry.grossAmount).toBe("300.00")
    expect(entry.feeAmount).toBe("8.76")
    expect(entry.amount).toBe("291.24")
  })
})

describe("cálculo da comissão — quem paga a taxa", () => {
  const withFeeMode = (feeMode: string) =>
    planSaleCommissions(sale({ salonSettings: { dateBasis: null, feeMode, discountMode: null } }))[0]

  it("salão paga tudo: comissão cheia", () => {
    expect(withFeeMode("salon")).toMatchObject({ feeAmount: "0.00", amount: "100.00" })
  })

  it("profissional paga tudo: a taxa inteira do item sai da comissão", () => {
    expect(withFeeMode("professional")).toMatchObject({ feeAmount: "5.84", amount: "94.16" })
  })

  it("meio a meio: metade da taxa do item", () => {
    expect(withFeeMode("split")).toMatchObject({ feeAmount: "2.92", amount: "97.08" })
  })

  it("a taxa nunca deixa a comissão negativa", () => {
    const [entry] = planSaleCommissions(
      sale({
        salonSettings: { dateBasis: null, feeMode: "professional", discountMode: null },
        professionals: new Map([[PRO, { commissionRate: "1.00", settings: null }]]),
      })
    )
    // 1% de R$ 200 = R$ 2,00; a taxa do item é R$ 5,84.
    expect(entry).toMatchObject({ grossAmount: "2.00", feeAmount: "2.00", amount: "0.00" })
  })

  it("com duas formas de pagamento a taxa da comanda é repartida pelo valor de cada item", () => {
    const entries = planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-16T15:00:00Z"), total: "300.00", amountDue: "0.00" },
        items: [
          { id: "a", serviceId: SERVICE, productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "0.00", total: "200.00" },
          { id: "b", serviceId: "svc-2", productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "0.00", total: "100.00" },
        ],
        // R$ 150 no crédito (2,92% = R$ 4,38) e R$ 150 no PIX (sem taxa).
        payments: [
          { feeAmount: "4.38", settlesOn: "2026-12-16" },
          { feeAmount: "0.00", settlesOn: "2026-11-16" },
        ],
      })
    )

    // Taxa efetiva 1,46%: o item de R$ 200 carrega R$ 2,92 e o de R$ 100, R$ 1,46.
    // Metade de cada é do profissional (50%).
    expect(entries.map((e) => e.feeAmount)).toEqual(["1.46", "0.73"])
    expect(entries.map((e) => e.amount)).toEqual(["98.54", "49.27"])
  })
})

describe("cálculo da comissão — quem arca com o desconto", () => {
  // Serviço de R$ 200 com R$ 40 de desconto: o cliente paga R$ 160. Sem taxa.
  const withDiscountMode = (discountMode: string) =>
    planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-16T15:00:00Z"), total: "160.00", amountDue: "0.00" },
        items: [
          { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "40.00", total: "160.00" },
        ],
        payments: [{ feeAmount: "0.00", settlesOn: "2026-11-16" }],
        salonSettings: { dateBasis: null, feeMode: null, discountMode },
      })
    )[0]

  it("salão arca: comissão sobre o valor cheio", () => {
    expect(withDiscountMode("salon")).toMatchObject({ baseAmount: "200.00", grossAmount: "100.00" })
  })

  it("proporcional: comissão sobre o que o cliente pagou", () => {
    expect(withDiscountMode("proportional")).toMatchObject({ baseAmount: "160.00", grossAmount: "80.00" })
  })

  it("profissional arca: o desconto sai inteiro da comissão", () => {
    expect(withDiscountMode("professional")).toMatchObject({ baseAmount: "200.00", grossAmount: "60.00" })
  })

  it("meio a meio: metade do desconto sai da comissão", () => {
    expect(withDiscountMode("split")).toMatchObject({ baseAmount: "200.00", grossAmount: "80.00" })
  })

  it("desconto maior que a comissão zera, não fica negativo", () => {
    const [entry] = planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-16T15:00:00Z"), total: "50.00", amountDue: "0.00" },
        items: [
          { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, quantity: "1.000", discountAmount: "150.00", total: "50.00" },
        ],
        payments: [{ feeAmount: "0.00", settlesOn: "2026-11-16" }],
        salonSettings: { dateBasis: null, feeMode: null, discountMode: "professional" },
      })
    )
    expect(entry).toMatchObject({ grossAmount: "0.00", amount: "0.00" })
  })
})

describe("cálculo da comissão — regra por item", () => {
  it("valor fixo é por unidade", () => {
    const [entry] = planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-16T15:00:00Z"), total: "90.00", amountDue: "0.00" },
        items: [
          { id: "item-1", serviceId: null, productId: PRODUCT, professionalId: PRO, quantity: "3.000", discountAmount: "0.00", total: "90.00" },
        ],
        payments: [{ feeAmount: "0.00", settlesOn: "2026-11-16" }],
        rules: [{ professionalId: null, serviceId: null, productId: PRODUCT, kind: "fixed", value: "5.00" }],
      })
    )
    expect(entry).toMatchObject({ rateKind: "fixed", rateValue: "5.00", grossAmount: "15.00", amount: "15.00" })
  })

  it("no valor fixo, a taxa proporcional segue a fração que a comissão é do item", () => {
    const [entry] = planSaleCommissions(
      sale({ rules: [{ professionalId: null, serviceId: SERVICE, productId: null, kind: "fixed", value: "50.00" }] })
    )
    // R$ 50 de R$ 200 = 25% do item → 25% da taxa de R$ 5,84.
    expect(entry).toMatchObject({ grossAmount: "50.00", feeAmount: "1.46", amount: "48.54" })
  })

  it("a exceção do profissional vence o padrão do salão para o mesmo item", () => {
    const [entry] = planSaleCommissions(
      sale({
        payments: [{ feeAmount: "0.00", settlesOn: "2026-11-16" }],
        rules: [
          { professionalId: null, serviceId: SERVICE, productId: null, kind: "percent", value: "30.00" },
          { professionalId: PRO, serviceId: SERVICE, productId: null, kind: "percent", value: "45.00" },
          // Exceção de OUTRO profissional não vale para este.
          { professionalId: "pro-2", serviceId: SERVICE, productId: null, kind: "percent", value: "90.00" },
        ],
      })
    )
    expect(entry).toMatchObject({ rateValue: "45.00", grossAmount: "90.00" })
  })

  it("item com regra de 0% aparece no extrato com comissão zero", () => {
    const [entry] = planSaleCommissions(
      sale({ rules: [{ professionalId: null, serviceId: SERVICE, productId: null, kind: "percent", value: "0.00" }] })
    )
    expect(entry).toMatchObject({ rateValue: "0.00", grossAmount: "0.00", feeAmount: "0.00", amount: "0.00" })
  })

  it("item sem profissional, ou de profissional de fora do salão, não gera comissão", () => {
    const entries = planSaleCommissions(
      sale({
        items: [
          { id: "a", serviceId: SERVICE, productId: null, professionalId: null, quantity: "1.000", discountAmount: "0.00", total: "100.00" },
          { id: "b", serviceId: SERVICE, productId: null, professionalId: "intruso", quantity: "1.000", discountAmount: "0.00", total: "100.00" },
        ],
      })
    )
    expect(entries).toEqual([])
  })
})

describe("cálculo da comissão — quando fica disponível", () => {
  it("competência: no dia da comanda em Brasília, não em UTC", () => {
    const [entry] = planSaleCommissions(sale())
    // 01h UTC do dia 17 ainda é dia 16 em Brasília.
    expect(entry.competenceDate).toBe("2026-11-16")
    expect(entry.releaseDate).toBe("2026-11-16")
  })

  it("disponibilidade: no último dia de recebimento dos pagamentos", () => {
    const [entry] = planSaleCommissions(
      sale({
        salonSettings: { dateBasis: "availability", feeMode: null, discountMode: null },
        payments: [
          { feeAmount: "2.92", settlesOn: "2026-12-16" },
          { feeAmount: "0.00", settlesOn: "2026-11-16" },
        ],
      })
    )
    expect(entry.competenceDate).toBe("2026-11-16")
    expect(entry.releaseDate).toBe("2026-12-16")
  })

  it("disponibilidade com valor em aberto: sem data até o cliente quitar", () => {
    const [entry] = planSaleCommissions(
      sale({
        sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "200.00", amountDue: "70.00" },
        salonSettings: { dateBasis: "availability", feeMode: null, discountMode: null },
      })
    )
    expect(entry.releaseDate).toBeNull()
  })

  it("competência não espera o cliente pagar", () => {
    const [entry] = planSaleCommissions(
      sale({ sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "200.00", amountDue: "70.00" } })
    )
    expect(entry.releaseDate).toBe("2026-11-16")
  })

  it("a regra de data é a do profissional, quando ele tem exceção", () => {
    const [entry] = planSaleCommissions(
      sale({
        salonSettings: { dateBasis: "competence", feeMode: null, discountMode: null },
        professionals: new Map([
          [PRO, { commissionRate: "50.00", settings: { dateBasis: "availability", feeMode: null, discountMode: null } }],
        ]),
      })
    )
    expect(entry.releaseDate).toBe("2026-12-16")
  })
})

describe("totais do extrato", () => {
  it("soma em centavos a partir das strings do banco", () => {
    expect(
      commissionTotals([
        { baseAmount: "200.00", grossAmount: "100.00", feeAmount: "2.92", amount: "97.08" },
        { baseAmount: "0.10", grossAmount: "0.20", feeAmount: "0.00", amount: "0.20" },
      ])
    ).toEqual({ baseCents: 20010, grossCents: 10020, feeCents: 292, amountCents: 9728, count: 2 })
  })

  it("lista vazia dá zero", () => {
    expect(commissionTotals([])).toEqual({ baseCents: 0, grossCents: 0, feeCents: 0, amountCents: 0, count: 0 })
  })
})
