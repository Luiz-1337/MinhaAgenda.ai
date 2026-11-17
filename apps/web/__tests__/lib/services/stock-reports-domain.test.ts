import { describe, it, expect } from "vitest"
import {
  buildConsumptionReport,
  buildMovementReport,
  planReportPeriod,
  unitsToMeasureMilli,
  type ReportProduct,
} from "@repo/db/src/domain/stock-reports"

/**
 * Os relatórios de estoque, testados sem banco (docs/ROADMAP.md, fase 4, fatia 4f).
 *
 * O que estes testes seguram: a conta fecha. O saldo final do relatório tem que ser
 * o saldo inicial mais tudo o que aconteceu no período — se não fechar, o dono
 * confere a prateleira contra um número errado.
 */

const shampoo: ReportProduct = {
  id: "p-shampoo",
  name: "Shampoo 1L",
  trackStock: true,
  costPrice: "20.00",
  contentAmount: "1000.000",
  contentUnit: "ml",
}
const pente: ReportProduct = {
  id: "p-pente",
  name: "Pente",
  trackStock: true,
  costPrice: null,
  contentAmount: null,
  contentUnit: null,
}

describe("planReportPeriod", () => {
  // 17/nov/2026, 15h em Brasília.
  const now = new Date("2026-11-17T18:00:00Z")

  it("sem datas, do dia 1 do mês até hoje", () => {
    expect(planReportPeriod({}, now)).toEqual({ ok: true, from: "2026-11-01", to: "2026-11-17" })
  })

  it("hoje é o dia de Brasília, não o de UTC", () => {
    // 1h da manhã de 1/dez em UTC ainda é 30/nov em Brasília.
    expect(planReportPeriod({}, new Date("2026-12-01T01:00:00Z"))).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-30",
    })
  })

  it("datas invertidas são trocadas", () => {
    expect(planReportPeriod({ from: "2026-11-10", to: "2026-11-01" }, now)).toEqual({
      ok: true,
      from: "2026-11-01",
      to: "2026-11-10",
    })
  })

  it("recusa data que não existe e período acima de um ano", () => {
    expect(planReportPeriod({ from: "2026-02-30", to: "2026-03-01" }, now).ok).toBe(false)
    expect(planReportPeriod({ from: "2025-01-01", to: "2026-11-17" }, now).ok).toBe(false)
    expect(planReportPeriod({ from: "2025-11-17", to: "2026-11-17" }, now).ok).toBe(true)
  })
})

describe("buildMovementReport", () => {
  it("separa as saídas por motivo e fecha o saldo final", () => {
    const report = buildMovementReport({
      products: [shampoo],
      openings: new Map([["p-shampoo", "5.000"]]),
      aggregates: [
        { productId: "p-shampoo", kind: "purchase", quantity: "10.000" },
        { productId: "p-shampoo", kind: "in", quantity: "2.000" },
        { productId: "p-shampoo", kind: "sale", quantity: "-3.000" },
        { productId: "p-shampoo", kind: "consumption", quantity: "-0.060" },
        { productId: "p-shampoo", kind: "request", quantity: "-2.000" },
        { productId: "p-shampoo", kind: "out", quantity: "-1.000" },
        { productId: "p-shampoo", kind: "adjustment", quantity: "-0.500" },
      ],
    })

    expect(report.rows).toEqual([
      {
        productId: "p-shampoo",
        name: "Shampoo 1L",
        openingMilli: 5000,
        inMilli: 12000,
        soldMilli: 3000,
        consumedMilli: 60,
        requestedMilli: 2000,
        outMilli: 1000,
        adjustmentMilli: -500,
        // 5 + 12 − 3 − 0,06 − 2 − 1 − 0,5
        closingMilli: 10440,
        inValueCents: 24000,
        // 6,06 unidades × R$ 20,00
        outValueCents: 12120,
      },
    ])
    expect(report.totals).toEqual({ products: 1, inValueCents: 24000, outValueCents: 12120 })
  })

  it("produto parado e zerado não aparece; parado com saldo aparece", () => {
    const report = buildMovementReport({
      products: [shampoo, pente],
      openings: new Map([["p-pente", "4.000"]]),
      aggregates: [],
    })
    expect(report.rows.map((row) => row.productId)).toEqual(["p-pente"])
    expect(report.rows[0]).toMatchObject({ openingMilli: 4000, closingMilli: 4000, outValueCents: 0 })
  })

  it("sem custo cadastrado, o valor é zero; saldo negativo continua negativo", () => {
    const report = buildMovementReport({
      products: [pente],
      openings: new Map(),
      aggregates: [{ productId: "p-pente", kind: "sale", quantity: "-2.000" }],
    })
    expect(report.rows[0]).toMatchObject({ soldMilli: 2000, closingMilli: -2000, outValueCents: 0 })
  })

  it("ignora movimento de produto que não é do salão", () => {
    const report = buildMovementReport({
      products: [shampoo],
      openings: new Map(),
      aggregates: [{ productId: "outro", kind: "in", quantity: "9.000" }],
    })
    expect(report.rows).toEqual([])
  })
})

describe("buildConsumptionReport", () => {
  it("soma por produto, lista os serviços e converte para a medida do fracionado", () => {
    const report = buildConsumptionReport({
      products: [shampoo, pente],
      aggregates: [
        { productId: "p-shampoo", serviceId: "s-corte", serviceName: "Corte", quantity: "-0.060", items: 2 },
        { productId: "p-shampoo", serviceId: "s-lavagem", serviceName: "Lavagem", quantity: "-0.300", items: 6 },
        { productId: "p-pente", serviceId: "s-corte", serviceName: "Corte", quantity: "-1.000", items: 1 },
      ],
    })

    expect(report.rows).toEqual([
      {
        productId: "p-shampoo",
        name: "Shampoo 1L",
        contentUnit: "ml",
        unitsMilli: 360,
        // 0,36 unidade de 1000 ml
        measureMilli: 360000,
        costCents: 720,
        services: [
          { serviceId: "s-lavagem", serviceName: "Lavagem", items: 6, unitsMilli: 300, costCents: 600 },
          { serviceId: "s-corte", serviceName: "Corte", items: 2, unitsMilli: 60, costCents: 120 },
        ],
      },
      {
        productId: "p-pente",
        name: "Pente",
        contentUnit: null,
        unitsMilli: 1000,
        measureMilli: null,
        costCents: 0,
        services: [{ serviceId: "s-corte", serviceName: "Corte", items: 1, unitsMilli: 1000, costCents: 0 }],
      },
    ])
    expect(report.totalCostCents).toBe(720)
  })

  it("serviço apagado continua contando, sem nome", () => {
    const report = buildConsumptionReport({
      products: [shampoo],
      aggregates: [{ productId: "p-shampoo", serviceId: null, serviceName: null, quantity: "-0.030", items: 1 }],
    })
    expect(report.rows[0].services).toEqual([
      { serviceId: null, serviceName: null, items: 1, unitsMilli: 30, costCents: 60 },
    ])
  })

  it("sem consumo, relatório vazio", () => {
    expect(buildConsumptionReport({ products: [shampoo], aggregates: [] })).toEqual({ rows: [], totalCostCents: 0 })
  })
})

describe("unitsToMeasureMilli", () => {
  it("só converte produto fracionado", () => {
    expect(unitsToMeasureMilli(500, "1000.000")).toBe(500000)
    expect(unitsToMeasureMilli(500, null)).toBeNull()
    expect(unitsToMeasureMilli(500, "0")).toBeNull()
  })
})
