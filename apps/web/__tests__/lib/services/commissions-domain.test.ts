import { describe, it, expect } from "vitest"
import {
  DEFAULT_COMMISSION_SETTINGS,
  advancePaidDate,
  commissionEntryKey,
  commissionNetCents,
  commissionTotals,
  parseCommissionRate,
  planAssistantRule,
  planCommissionAdjustment,
  planCommissionPayment,
  planCommissionPaymentBatch,
  planCommissionRule,
  planSaleCommissions,
  resolveCommissionRate,
  resolveCommissionSettings,
  unpaidPlannedEntries,
  type CommissionAssistantRuleRow,
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
      costMode: "proportional",
    })
  })

  it("o profissional sobrescreve campo a campo; o resto segue o salão", () => {
    const settings = resolveCommissionSettings(
      { dateBasis: "availability", feeMode: "salon", discountMode: null },
      { dateBasis: null, feeMode: "professional", discountMode: null }
    )
    expect(settings).toEqual({
      dateBasis: "availability",
      feeMode: "professional",
      discountMode: "salon",
      costMode: "proportional",
    })
  })

  it("valor desconhecido no banco cai para o próximo nível em vez de quebrar", () => {
    const settings = resolveCommissionSettings(
      { dateBasis: "availability", feeMode: "lixo", discountMode: 42 },
      { dateBasis: "outro lixo", feeMode: null, discountMode: null }
    )
    expect(settings).toEqual({
      dateBasis: "availability",
      feeMode: "proportional",
      discountMode: "salon",
      costMode: "proportional",
    })
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
    ).toEqual({
      baseCents: 20010,
      grossCents: 10020,
      feeCents: 292,
      assistantCents: 0,
      costCents: 0,
      amountCents: 9728,
      count: 2,
    })
  })

  it("o desconto de auxiliar entra na conta: comissões − taxas − auxiliar = a receber", () => {
    const totals = commissionTotals([
      { baseAmount: "600.00", grossAmount: "300.00", feeAmount: "8.76", assistantDeduction: "60.00", amount: "231.24" },
      { baseAmount: "0.00", grossAmount: "60.00", feeAmount: "0.00", assistantDeduction: "0.00", amount: "60.00" },
    ])
    expect(totals.assistantCents).toBe(6000)
    expect(totals.grossCents - totals.feeCents - totals.assistantCents).toBe(totals.amountCents)
  })

  it("lista vazia dá zero", () => {
    expect(commissionTotals([])).toEqual({
      baseCents: 0,
      grossCents: 0,
      feeCents: 0,
      assistantCents: 0,
      costCents: 0,
      amountCents: 0,
      count: 0,
    })
  })
})

// ============================================================================
// Comissão como auxiliar (fatia 3b)
// ============================================================================

const AUX = "pro-aux"

function assistantRule(overrides: Partial<CommissionAssistantRuleRow> = {}): CommissionAssistantRuleRow {
  return { professionalId: null, serviceId: SERVICE, kind: "percent", value: "10.00", base: "gross", deductFrom: "professional", ...overrides }
}

/** Serviço de R$ 600 a 50%, crédito a 2,92% (taxa de R$ 17,52), com auxiliar. */
function saleWithAssistant(overrides: Partial<CommissionSaleInput> = {}): CommissionSaleInput {
  return sale({
    sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "600.00", amountDue: "0.00" },
    items: [
      { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, assistantId: AUX, quantity: "1.000", discountAmount: "0.00", total: "600.00" },
    ],
    payments: [{ feeAmount: "17.52", settlesOn: "2026-12-16" }],
    professionals: new Map([
      [PRO, { commissionRate: "50.00", settings: null }],
      [AUX, { commissionRate: "0.00", settings: null }],
    ]),
    assistantRules: [assistantRule()],
    ...overrides,
  })
}

describe("comissão como auxiliar", () => {
  it("exemplo da auditoria: R$ 600, 50%, taxa R$ 8,76, auxiliar R$ 60 → R$ 231,24", () => {
    const [professional, assistant] = planSaleCommissions(saleWithAssistant())

    expect(professional).toMatchObject({
      professionalId: PRO,
      role: "professional",
      grossAmount: "300.00",
      feeAmount: "8.76",
      assistantDeduction: "60.00",
      amount: "231.24",
    })
    // A linha do auxiliar: o que ele recebe, sem taxa e sem desconto.
    expect(assistant).toMatchObject({
      saleItemId: "item-1",
      professionalId: AUX,
      role: "assistant",
      baseAmount: "600.00",
      rateKind: "percent",
      rateValue: "10.00",
      grossAmount: "60.00",
      feeAmount: "0.00",
      assistantDeduction: "0.00",
      amount: "60.00",
    })
  })

  it("saindo do salão, a comissão do profissional não muda", () => {
    const [professional, assistant] = planSaleCommissions(
      saleWithAssistant({ assistantRules: [assistantRule({ deductFrom: "salon" })] })
    )
    expect(professional).toMatchObject({ assistantDeduction: "0.00", amount: "291.24" })
    expect(assistant.amount).toBe("60.00")
  })

  it("percentual sobre a comissão do profissional (antes da taxa)", () => {
    const [professional, assistant] = planSaleCommissions(
      saleWithAssistant({ assistantRules: [assistantRule({ base: "commission", value: "20.00" })] })
    )
    // 20% de R$ 300,00.
    expect(assistant).toMatchObject({ baseAmount: "300.00", grossAmount: "60.00", amount: "60.00" })
    expect(professional.amount).toBe("231.24")
  })

  it("valor fixo é por unidade", () => {
    const [, assistant] = planSaleCommissions(
      saleWithAssistant({
        items: [
          { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, assistantId: AUX, quantity: "2.000", discountAmount: "0.00", total: "600.00" },
        ],
        assistantRules: [assistantRule({ kind: "fixed", value: "15.00" })],
      })
    )
    expect(assistant).toMatchObject({ rateKind: "fixed", rateValue: "15.00", grossAmount: "30.00" })
  })

  it("a regra de quem auxilia vence o padrão do salão", () => {
    const [professional, assistant] = planSaleCommissions(
      saleWithAssistant({
        assistantRules: [assistantRule(), assistantRule({ professionalId: AUX, value: "20.00" })],
      })
    )
    expect(assistant.grossAmount).toBe("120.00")
    expect(professional).toMatchObject({ assistantDeduction: "120.00", amount: "171.24" })
  })

  it("sem regra o auxiliar aparece com zero e nada é descontado", () => {
    const [professional, assistant] = planSaleCommissions(saleWithAssistant({ assistantRules: [] }))
    expect(professional).toMatchObject({ assistantDeduction: "0.00", amount: "291.24" })
    expect(assistant).toMatchObject({ role: "assistant", rateValue: "0.00", grossAmount: "0.00", amount: "0.00" })
  })

  it("o desconto nunca deixa o profissional negativo — o auxiliar recebe inteiro", () => {
    const [professional, assistant] = planSaleCommissions(
      saleWithAssistant({
        // Comissão de 5% = R$ 30,00; taxa R$ 0,88; auxiliar R$ 60,00.
        professionals: new Map([
          [PRO, { commissionRate: "5.00", settings: null }],
          [AUX, { commissionRate: "0.00", settings: null }],
        ]),
      })
    )
    expect(professional).toMatchObject({ grossAmount: "30.00", feeAmount: "0.88", assistantDeduction: "29.12", amount: "0.00" })
    expect(assistant.amount).toBe("60.00")
  })

  it("auxiliar igual ao profissional, de outro salão ou em produto é ignorado", () => {
    const same = planSaleCommissions(
      saleWithAssistant({
        items: [
          { id: "item-1", serviceId: SERVICE, productId: null, professionalId: PRO, assistantId: PRO, quantity: "1.000", discountAmount: "0.00", total: "600.00" },
        ],
      })
    )
    expect(same).toHaveLength(1)
    expect(same[0]).toMatchObject({ role: "professional", assistantDeduction: "0.00" })

    const outsider = planSaleCommissions(
      saleWithAssistant({ professionals: new Map([[PRO, { commissionRate: "50.00", settings: null }]]) })
    )
    expect(outsider).toHaveLength(1)

    const onProduct = planSaleCommissions(
      saleWithAssistant({
        items: [
          { id: "item-1", serviceId: null, productId: PRODUCT, professionalId: PRO, assistantId: AUX, quantity: "1.000", discountAmount: "0.00", total: "600.00" },
        ],
      })
    )
    expect(onProduct).toHaveLength(1)
  })

  it("a data do auxiliar segue a regra dele, não a de quem executou", () => {
    const [professional, assistant] = planSaleCommissions(
      saleWithAssistant({
        professionals: new Map([
          [PRO, { commissionRate: "50.00", settings: null }],
          [AUX, { commissionRate: "0.00", settings: { dateBasis: "availability", feeMode: null, discountMode: null } }],
        ]),
      })
    )
    expect(professional.releaseDate).toBe("2026-11-16")
    expect(assistant.releaseDate).toBe("2026-12-16")
  })

  it("regra do formulário: valida tipo, valor, base e de quem sai", () => {
    expect(planAssistantRule({ kind: "percent", value: 10, base: "commission", deductFrom: "salon" })).toEqual({
      ok: true,
      kind: "percent",
      value: "10.00",
      base: "commission",
      deductFrom: "salon",
    })
    // Valor fixo não incide sobre nada: a base gravada é a padrão.
    expect(planAssistantRule({ kind: "fixed", value: 15, base: "commission", deductFrom: "professional" })).toEqual({
      ok: true,
      kind: "fixed",
      value: "15.00",
      base: "gross",
      deductFrom: "professional",
    })
    expect(planAssistantRule({ kind: "percent", value: 101, base: "gross", deductFrom: "salon" }).ok).toBe(false)
    expect(planAssistantRule({ kind: "percent", value: 10, base: "tudo", deductFrom: "salon" }).ok).toBe(false)
    expect(planAssistantRule({ kind: "percent", value: 10, base: "gross", deductFrom: "cliente" }).ok).toBe(false)
  })
})

// ============================================================================
// Vales e bonificações (fatia 3c)
// ============================================================================

describe("vales e bonificações", () => {
  const draft = { kind: "advance", amount: 150, referenceDate: "2026-11-20", notes: "  adiantamento da quinzena  " }

  it("grava o valor em reais com centavos, a data e a observação aparada", () => {
    expect(planCommissionAdjustment(draft)).toEqual({
      ok: true,
      kind: "advance",
      amount: "150.00",
      referenceDate: "2026-11-20",
      notes: "adiantamento da quinzena",
    })
    expect(planCommissionAdjustment({ kind: "bonus", amount: 0.1, referenceDate: "2026-11-20" })).toEqual({
      ok: true,
      kind: "bonus",
      amount: "0.10",
      referenceDate: "2026-11-20",
      notes: null,
    })
  })

  it("o valor é sempre positivo: zero, negativo e texto são barrados", () => {
    expect(planCommissionAdjustment({ ...draft, amount: 0 }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, amount: -50 }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, amount: "150" }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, amount: Number.NaN }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, amount: 1_000_000.01 }).ok).toBe(false)
  })

  it("tipo desconhecido, data inválida e observação longa demais são barrados", () => {
    expect(planCommissionAdjustment({ ...draft, kind: "desconto" }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, referenceDate: "20/11/2026" }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, referenceDate: "2026-02-30" }).ok).toBe(false)
    expect(planCommissionAdjustment({ ...draft, notes: "x".repeat(501) }).ok).toBe(false)
  })

  it("líquido = a receber − vales + bonificações", () => {
    expect(commissionNetCents({ amountCents: 23124, advanceCents: 10000, bonusCents: 5000 })).toBe(18124)
    expect(commissionNetCents({ amountCents: 23124, advanceCents: 0, bonusCents: 0 })).toBe(23124)
  })

  it("vale maior que a comissão deixa o líquido negativo, não zero", () => {
    expect(commissionNetCents({ amountCents: 9708, advanceCents: 15000, bonusCents: 0 })).toBe(-5292)
  })
})

// ============================================================================
// Pagamento de comissão (fatia 3d)
// ============================================================================

describe("pagamento de comissão", () => {
  // 16/nov/2026, 15h em Brasília.
  const now = new Date("2026-11-16T18:00:00Z")

  describe("o lote", () => {
    const draft = { cutoffDate: "2026-11-30", paidOn: "2026-11-16", notes: "  quinzena  ", professionals: 2 }

    it("aceita a data de corte, o dia do pagamento e apara a observação", () => {
      expect(planCommissionPaymentBatch(draft, now)).toEqual({
        ok: true,
        cutoffDate: "2026-11-30",
        paidOn: "2026-11-16",
        notes: "quinzena",
      })
      expect(planCommissionPaymentBatch({ ...draft, notes: "   " }, now)).toMatchObject({ ok: true, notes: null })
    })

    it("o dia do pagamento não pode ser futuro: é quando o dinheiro FOI entregue", () => {
      expect(planCommissionPaymentBatch({ ...draft, paidOn: "2026-11-17" }, now).ok).toBe(false)
      // Ontem pode: pagamento registrado no dia seguinte.
      expect(planCommissionPaymentBatch({ ...draft, paidOn: "2026-11-15" }, now).ok).toBe(true)
    })

    it("a data de corte pode ser futura: adiantar o que ainda vai liberar é escolha de quem paga", () => {
      expect(planCommissionPaymentBatch({ ...draft, cutoffDate: "2026-12-31" }, now).ok).toBe(true)
    })

    it("datas inválidas, lote vazio, lote grande demais e observação longa são barrados", () => {
      expect(planCommissionPaymentBatch({ ...draft, cutoffDate: "30/11/2026" }, now).ok).toBe(false)
      expect(planCommissionPaymentBatch({ ...draft, paidOn: "2026-02-30" }, now).ok).toBe(false)
      expect(planCommissionPaymentBatch({ ...draft, professionals: 0 }, now).ok).toBe(false)
      expect(planCommissionPaymentBatch({ ...draft, professionals: 201 }, now).ok).toBe(false)
      expect(planCommissionPaymentBatch({ ...draft, notes: "x".repeat(501) }, now).ok).toBe(false)
    })
  })

  describe("quanto pagar a um profissional", () => {
    const entries = [{ amount: "145.62" }, { amount: "97.08" }]

    it("valor pago = comissões − vales + bonificações", () => {
      const plan = planCommissionPayment({
        entries,
        adjustments: [
          { kind: "advance", amount: "100.00" },
          { kind: "bonus", amount: "50.00" },
        ],
      })

      expect(plan).toEqual({
        ok: true,
        entriesAmount: "242.70",
        advancesAmount: "100.00",
        bonusesAmount: "50.00",
        amount: "192.70",
        amountCents: 19270,
      })
    })

    it("só bonificação, sem comissão nenhuma, também se paga", () => {
      const plan = planCommissionPayment({ entries: [], adjustments: [{ kind: "bonus", amount: "80.00" }] })
      expect(plan).toMatchObject({ ok: true, entriesAmount: "0.00", amount: "80.00" })
    })

    it("nada em aberto não é pagamento", () => {
      expect(planCommissionPayment({ entries: [], adjustments: [] }).ok).toBe(false)
    })

    it("vale maior que a comissão não se paga nem se quita: o saldo fica em aberto", () => {
      const plan = planCommissionPayment({
        entries: [{ amount: "97.08" }],
        adjustments: [{ kind: "advance", amount: "300.00" }],
      })
      expect(plan.ok).toBe(false)
    })

    it("comissão e vale que se anulam quitam com valor zero, sem sair dinheiro", () => {
      const plan = planCommissionPayment({
        entries: [{ amount: "100.00" }],
        adjustments: [{ kind: "advance", amount: "100.00" }],
      })
      expect(plan).toMatchObject({ ok: true, amount: "0.00", amountCents: 0 })
    })

    it("recusa quando a soma mudou desde que a tela foi aberta", () => {
      // A tela mostrava R$ 242,70; alguém lançou um vale de R$ 50,00 nesse meio-tempo.
      const plan = planCommissionPayment({
        entries,
        adjustments: [{ kind: "advance", amount: "50.00" }],
        expectedCents: 24270,
      })
      expect(plan.ok).toBe(false)

      expect(planCommissionPayment({ entries, adjustments: [], expectedCents: 24270 }).ok).toBe(true)
    })

    it("soma em centavos: 0,10 + 0,20 é 0,30, não 0,30000000000000004", () => {
      const plan = planCommissionPayment({ entries: [{ amount: "0.10" }, { amount: "0.20" }], adjustments: [] })
      expect(plan).toMatchObject({ ok: true, amount: "0.30", amountCents: 30 })
    })
  })

  describe("comissão paga é fotografia", () => {
    const planned = planSaleCommissions(sale())

    it("a chave de uma linha é o item, a pessoa e o papel", () => {
      expect(commissionEntryKey({ saleItemId: "item-1", professionalId: PRO, role: "professional" })).toBe(
        "item-1|pro-1|professional"
      )
      expect(commissionEntryKey({ saleItemId: "item-1", professionalId: PRO, role: "assistant" })).not.toBe(
        commissionEntryKey({ saleItemId: "item-1", professionalId: PRO, role: "professional" })
      )
    })

    it("o recálculo regrava só o que está em aberto", () => {
      expect(planned).toHaveLength(1)
      expect(unpaidPlannedEntries(planned, new Set())).toEqual(planned)

      const paid = new Set([commissionEntryKey(planned[0])])
      expect(unpaidPlannedEntries(planned, paid)).toEqual([])
    })

    it("pagar o profissional não congela a linha do auxiliar do mesmo item", () => {
      const paid = new Set([commissionEntryKey({ saleItemId: "item-1", professionalId: PRO, role: "professional" })])
      const assistantLine = { ...planned[0], professionalId: "aux-1", role: "assistant" as const }

      expect(unpaidPlannedEntries([planned[0], assistantLine], paid)).toEqual([assistantLine])
    })
  })

  describe("o dia em que o dinheiro do vale saiu", () => {
    it("data de hoje ou passada vale como está", () => {
      expect(advancePaidDate("2026-11-16", now)).toBe("2026-11-16")
      expect(advancePaidDate("2026-11-10", now)).toBe("2026-11-10")
    })

    it("vale para descontar no mês que vem: o dinheiro saiu hoje, não na data do extrato", () => {
      expect(advancePaidDate("2026-12-05", now)).toBe("2026-11-16")
    })
  })
})
