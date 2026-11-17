import { describe, it, expect } from "vitest"
import {
  commissionTotals,
  planSaleCommissions,
  type CommissionSaleInput,
} from "@repo/db/src/domain/commissions"
import { itemCostCents, planAdditionalCost, serviceCostCents } from "@repo/db/src/domain/consumption"

/**
 * O custo do atendimento abatendo a comissão, testado sem banco (docs/ROADMAP.md,
 * fase 3, fatia 3e).
 *
 * O que estes testes seguram: serviço SEM custo cadastrado continua pagando
 * exatamente a comissão de antes — os números conferidos na auditoria (R$ 97,08 e
 * R$ 231,24) não podem mudar. E, com custo, o que sai da comissão segue a regra
 * "quem arca com o custo" e nunca deixa a comissão negativa.
 */

const PRO = "pro-1"
const AUX = "pro-aux"
const SERVICE = "svc-1"
const PRODUCT = "prd-1"

/** Serviço de R$ 200 a 50%, crédito a 2,92% (taxa de R$ 5,84): comissão R$ 100,00, taxa R$ 2,92. */
function sale(overrides: Partial<CommissionSaleInput> = {}, costAmount: string | null = "20.00"): CommissionSaleInput {
  return {
    sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "200.00", amountDue: "0.00" },
    items: [
      {
        id: "item-1",
        serviceId: SERVICE,
        productId: null,
        professionalId: PRO,
        quantity: "1.000",
        discountAmount: "0.00",
        total: "200.00",
        costAmount,
      },
    ],
    payments: [{ feeAmount: "5.84", settlesOn: "2026-12-16" }],
    salonSettings: null,
    professionals: new Map([[PRO, { commissionRate: "50.00", settings: null }]]),
    rules: [],
    ...overrides,
  }
}

const withCostMode = (costMode: string, costAmount = "20.00") =>
  planSaleCommissions(
    sale({ salonSettings: { dateBasis: null, feeMode: null, discountMode: null, costMode } }, costAmount)
  )[0]

describe("serviço sem custo: nada muda", () => {
  it("sem custo informado, a comissão é a conferida na auditoria", () => {
    for (const costAmount of [null, "0.00"]) {
      const [entry] = planSaleCommissions(sale({}, costAmount))
      expect(entry).toMatchObject({ grossAmount: "100.00", feeAmount: "2.92", costAmount: "0.00", amount: "97.08" })
    }
  })

  it("item sem o campo de custo (chamada antiga) também não muda", () => {
    const input = sale()
    const [entry] = planSaleCommissions({
      ...input,
      items: input.items.map((item) => {
        const legacy = { ...item }
        delete legacy.costAmount
        return legacy
      }),
    })
    expect(entry).toMatchObject({ costAmount: "0.00", amount: "97.08" })
  })
})

describe("quem arca com o custo", () => {
  it("padrão do sistema: o custo sai do valor do serviço antes da comissão", () => {
    // 50% de comissão → 50% do custo de R$ 20,00 = R$ 10,00.
    const [entry] = planSaleCommissions(sale())
    expect(entry).toMatchObject({
      baseAmount: "200.00",
      grossAmount: "100.00",
      feeAmount: "2.92",
      costAmount: "10.00",
      amount: "87.08",
    })
  })

  it("proporcional é o mesmo que calcular a comissão sobre (valor − custo)", () => {
    const entry = withCostMode("proportional", "37.00")
    // 50% × (200 − 37) = 81,50 = 100,00 − 18,50.
    expect(entry.costAmount).toBe("18.50")
    expect(entry.amount).toBe("78.58") // 100,00 − 2,92 − 18,50
  })

  it("salão arca com tudo: a comissão não muda", () => {
    expect(withCostMode("salon")).toMatchObject({ costAmount: "0.00", amount: "97.08" })
  })

  it("sai inteiro da comissão", () => {
    expect(withCostMode("professional")).toMatchObject({ costAmount: "20.00", amount: "77.08" })
  })

  it("meio a meio", () => {
    expect(withCostMode("split")).toMatchObject({ costAmount: "10.00", amount: "87.08" })
    expect(withCostMode("split", "0.05")).toMatchObject({ costAmount: "0.03" }) // 2,5 centavos → 3
  })

  it("a exceção do profissional vale sobre a regra do salão", () => {
    const [entry] = planSaleCommissions(
      sale({
        salonSettings: { dateBasis: null, feeMode: null, discountMode: null, costMode: "professional" },
        professionals: new Map([
          [
            PRO,
            { commissionRate: "50.00", settings: { dateBasis: null, feeMode: null, discountMode: null, costMode: "salon" } },
          ],
        ]),
      })
    )
    expect(entry).toMatchObject({ costAmount: "0.00", amount: "97.08" })
  })

  it("valor desconhecido na regra cai para o padrão em vez de quebrar", () => {
    expect(withCostMode("lixo")).toMatchObject({ costAmount: "10.00" })
  })
})

describe("o custo nunca deixa a comissão negativa", () => {
  it("custo maior que a comissão zera o que há a receber", () => {
    // Depois da taxa sobram R$ 97,08: é o máximo que o custo abate.
    expect(withCostMode("professional", "500.00")).toMatchObject({ costAmount: "97.08", amount: "0.00" })
  })

  it("custo negativo ou inválido é tratado como zero", () => {
    expect(withCostMode("professional", "-5.00")).toMatchObject({ costAmount: "0.00", amount: "97.08" })
    expect(withCostMode("professional", "abc")).toMatchObject({ costAmount: "0.00", amount: "97.08" })
  })
})

describe("custo com comissão em valor fixo", () => {
  it("proporcional usa a fração que a comissão representa do item", () => {
    // R$ 30,00 fixos num item de R$ 200,00 = 15%. Custo de R$ 20,00 → R$ 3,00.
    const [entry] = planSaleCommissions(
      sale({ rules: [{ professionalId: null, serviceId: SERVICE, productId: null, kind: "fixed", value: "30.00" }] })
    )
    expect(entry).toMatchObject({
      grossAmount: "30.00",
      feeAmount: "0.88", // 15% da taxa de R$ 5,84
      costAmount: "3.00",
      amount: "26.12",
    })
  })
})

describe("custo e auxiliar", () => {
  /** Serviço de R$ 600 a 50%, taxa R$ 17,52, auxiliar a 10% saindo do profissional: R$ 231,24. */
  const withAssistant = (costAmount: string | null) =>
    planSaleCommissions({
      sale: { saleDate: new Date("2026-11-17T01:00:00Z"), total: "600.00", amountDue: "0.00" },
      items: [
        {
          id: "item-1",
          serviceId: SERVICE,
          productId: null,
          professionalId: PRO,
          assistantId: AUX,
          quantity: "1.000",
          discountAmount: "0.00",
          total: "600.00",
          costAmount,
        },
      ],
      payments: [{ feeAmount: "17.52", settlesOn: "2026-12-16" }],
      salonSettings: null,
      professionals: new Map([
        [PRO, { commissionRate: "50.00", settings: null }],
        [AUX, { commissionRate: "0.00", settings: null }],
      ]),
      rules: [],
      assistantRules: [
        { professionalId: null, serviceId: SERVICE, kind: "percent", value: "10.00", base: "gross", deductFrom: "professional" },
      ],
    })

  it("sem custo, o número da auditoria continua: R$ 231,24", () => {
    const [professional] = withAssistant(null)
    expect(professional).toMatchObject({ assistantDeduction: "60.00", costAmount: "0.00", amount: "231.24" })
  })

  it("o custo vem depois da taxa e do auxiliar, e o auxiliar não é abatido", () => {
    const [professional, assistant] = withAssistant("40.00")
    // 50% do custo de R$ 40,00 = R$ 20,00 → 231,24 − 20,00.
    expect(professional).toMatchObject({ assistantDeduction: "60.00", costAmount: "20.00", amount: "211.24" })
    expect(assistant).toMatchObject({ role: "assistant", costAmount: "0.00", amount: "60.00" })
  })

  it("o teto do custo é o que sobrou depois da taxa e do auxiliar", () => {
    const [professional] = withAssistant("2000.00")
    // 50% de R$ 2.000,00 = R$ 1.000,00, mas só restam R$ 231,24.
    expect(professional).toMatchObject({ costAmount: "231.24", amount: "0.00" })
  })
})

describe("custo só existe em serviço", () => {
  it("produto vendido ignora o custo do atendimento", () => {
    const [entry] = planSaleCommissions(
      sale({
        items: [
          {
            id: "item-1",
            serviceId: null,
            productId: PRODUCT,
            professionalId: PRO,
            quantity: "1.000",
            discountAmount: "0.00",
            total: "200.00",
            costAmount: "20.00",
          },
        ],
      })
    )
    expect(entry).toMatchObject({ costAmount: "0.00", amount: "97.08" })
  })
})

describe("totais do extrato com custo", () => {
  it("o custo entra como coluna própria, e a conta fecha", () => {
    const totals = commissionTotals([
      { baseAmount: "200.00", grossAmount: "100.00", feeAmount: "2.92", costAmount: "10.00", amount: "87.08" },
      { baseAmount: "600.00", grossAmount: "300.00", feeAmount: "8.76", assistantDeduction: "60.00", costAmount: "20.00", amount: "211.24" },
    ])

    expect(totals.costCents).toBe(3000)
    expect(totals.grossCents - totals.feeCents - totals.assistantCents - totals.costCents).toBe(totals.amountCents)
  })
})

describe("custo de um atendimento", () => {
  it("custo adicional: vazio é zero, valor vira duas casas", () => {
    expect(planAdditionalCost(null)).toEqual({ ok: true, additionalCost: "0.00" })
    expect(planAdditionalCost("")).toEqual({ ok: true, additionalCost: "0.00" })
    expect(planAdditionalCost(2.5)).toEqual({ ok: true, additionalCost: "2.50" })
  })

  it("custo adicional negativo ou em texto é barrado", () => {
    expect(planAdditionalCost(-1).ok).toBe(false)
    expect(planAdditionalCost("2,50").ok).toBe(false)
  })

  it("custo do atendimento = custo adicional + produtos consumidos", () => {
    expect(
      serviceCostCents({
        additionalCost: "2.50",
        lines: [
          // 30 ml de um frasco de 1000 ml de R$ 60,00 = R$ 1,80.
          { perServiceMilli: 30_000, contentMilli: 1_000_000, costPrice: "60.00" },
          // 1 unidade de R$ 4,00.
          { perServiceMilli: 1000, contentMilli: null, costPrice: "4.00" },
          // Produto sem custo cadastrado não soma.
          { perServiceMilli: 1000, contentMilli: null, costPrice: null },
        ],
      })
    ).toBe(830)
  })

  it("serviço sem custo adicional e sem consumo custa zero", () => {
    expect(serviceCostCents({ additionalCost: "0.00", lines: [] })).toBe(0)
    expect(serviceCostCents({ additionalCost: null, lines: [] })).toBe(0)
  })

  it("o custo do item é o do atendimento × a quantidade", () => {
    expect(itemCostCents(830, "1.000")).toBe(830)
    expect(itemCostCents(830, "2.000")).toBe(1660)
    expect(itemCostCents(830, "0.500")).toBe(415)
    expect(itemCostCents(830, "0.000")).toBe(0)
    expect(itemCostCents(0, "3.000")).toBe(0)
  })
})
