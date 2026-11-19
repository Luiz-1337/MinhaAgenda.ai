import { describe, it, expect } from "vitest"
import {
  buildCustomerRanking,
  buildProfessionalRanking,
  buildReferralReport,
  buildSoldItemsReport,
  parseSalesReportView,
  type SoldItem,
} from "@repo/db/src/domain/sales-reports"

/**
 * Os relatórios de vendas e rankings, testados sem banco (docs/ROADMAP.md, fase
 * 9, fatia 9d).
 */

const item = (over: Partial<SoldItem>): SoldItem => ({
  saleId: "s1",
  kind: "service",
  refId: "corte",
  name: "Corte",
  quantity: 1,
  totalCents: 10000,
  customerId: "c1",
  customerName: "Cliente Um",
  day: "2026-11-10",
  professionalId: "p1",
  professionalName: "Profissional Um",
  ...over,
})

describe("produtos e serviços vendidos", () => {
  it("soma por item, conta as comandas e dá a parte do total; o que mais rendeu primeiro", () => {
    const report = buildSoldItemsReport([
      item({ saleId: "s1", totalCents: 10000 }),
      item({ saleId: "s2", totalCents: 8000 }),
      item({ saleId: "s2", kind: "product", refId: "shampoo", name: "Shampoo", quantity: 2, totalCents: 6000 }),
      item({ saleId: "s3", kind: "package", refId: "pk", name: "Pacote 5 cortes", totalCents: 36000 }),
      item({ saleId: "s4", kind: "subscription", refId: null, name: "Clube", totalCents: 0 }),
    ])
    expect(report.totalCents).toBe(60000)
    expect(report.byKind).toEqual({ service: 18000, product: 6000, package: 36000, subscription: 0 })
    expect(report.rows.map((row) => [row.key, row.quantity, row.sales, row.revenueCents, row.sharePercent])).toEqual([
      ["package:pk", 1, 1, 36000, 60],
      ["service:corte", 2, 2, 18000, 30],
      ["product:shampoo", 2, 1, 6000, 10],
      ["subscription:name:Clube", 1, 1, 0, 0],
    ])
  })

  it("o mesmo id em tipos diferentes não se mistura; tipo desconhecido é ignorado; sem venda, parte em branco", () => {
    const report = buildSoldItemsReport([
      item({ kind: "service", refId: "x", totalCents: 0 }),
      item({ kind: "product", refId: "x", name: "Outro", totalCents: 0 }),
      item({ kind: "gorjeta", refId: "g", totalCents: 500 }),
    ])
    expect(report.rows).toHaveLength(2)
    expect(report.totalCents).toBe(0)
    expect(report.rows[0].sharePercent).toBeNull()
  })
})

describe("ranking de clientes", () => {
  it("total, comandas, ticket médio e a última comanda; quem gastou mais primeiro", () => {
    const ranking = buildCustomerRanking([
      item({ saleId: "s1", customerId: "c1", customerName: "Ana", totalCents: 10000, day: "2026-11-05" }),
      item({ saleId: "s1", customerId: "c1", customerName: "Ana", totalCents: 3000, day: "2026-11-05" }),
      item({ saleId: "s2", customerId: "c1", customerName: "Ana", totalCents: 5000, day: "2026-11-12" }),
      item({ saleId: "s3", customerId: "c2", customerName: "Bia", totalCents: 30000, day: "2026-11-02" }),
    ])
    expect(ranking.customers).toBe(2)
    expect(ranking.totalCents).toBe(48000)
    expect(ranking.rows).toEqual([
      { customerId: "c2", name: "Bia", sales: 1, totalCents: 30000, averageCents: 30000, lastDay: "2026-11-02" },
      { customerId: "c1", name: "Ana", sales: 2, totalCents: 18000, averageCents: 9000, lastDay: "2026-11-12" },
    ])
  })

  it("a lista para nos 100 primeiros, mas os totais somam todos", () => {
    const items = Array.from({ length: 130 }, (_, index) =>
      item({ saleId: `s${index}`, customerId: `c${index}`, customerName: `Cliente ${index}`, totalCents: 1000 + index })
    )
    const ranking = buildCustomerRanking(items)
    expect(ranking.rows).toHaveLength(100)
    expect(ranking.customers).toBe(130)
    expect(ranking.rows[0].customerId).toBe("c129")
  })
})

describe("ranking de vendas", () => {
  it("serviço para quem executou, produto para quem vendeu; pacote não entra; sem profissional fica no fim", () => {
    const rows = buildProfessionalRanking([
      item({ professionalId: "p1", professionalName: "Ana", totalCents: 10000 }),
      item({ professionalId: "p1", professionalName: "Ana", kind: "product", quantity: 2, totalCents: 4000 }),
      item({ professionalId: "p2", professionalName: "Bia", totalCents: 30000 }),
      item({ professionalId: null, professionalName: null, kind: "product", totalCents: 99000 }),
      item({ professionalId: "p1", professionalName: "Ana", kind: "package", totalCents: 50000 }),
    ])
    expect(rows).toEqual([
      { professionalId: "p2", name: "Bia", serviceQuantity: 1, serviceCents: 30000, productQuantity: 0, productCents: 0, totalCents: 30000 },
      { professionalId: "p1", name: "Ana", serviceQuantity: 1, serviceCents: 10000, productQuantity: 2, productCents: 4000, totalCents: 14000 },
      { professionalId: null, name: "Sem profissional", serviceQuantity: 0, serviceCents: 0, productQuantity: 1, productCents: 99000, totalCents: 99000 },
    ])
  })
})

describe("indicação de clientes", () => {
  it("junta o que só difere por maiúscula, acento ou espaço, e mostra a grafia mais usada", () => {
    const report = buildReferralReport([
      "Instagram",
      "instagram ",
      "INSTAGRAM",
      "Instagram",
      "Indicação",
      "indicacao",
      "Google",
      null,
      "  ",
    ])
    expect(report.total).toBe(9)
    expect(report.informed).toBe(7)
    expect(report.rows).toEqual([
      { source: "Instagram", customers: 4, sharePercent: 57.1 },
      { source: "indicacao", customers: 2, sharePercent: 28.6 },
      { source: "Google", customers: 1, sharePercent: 14.3 },
    ])
  })

  it("ninguém informou: lista vazia", () => {
    expect(buildReferralReport([null, null])).toEqual({ rows: [], total: 2, informed: 0 })
    expect(buildReferralReport([])).toEqual({ rows: [], total: 0, informed: 0 })
  })
})

describe("qual relatório", () => {
  it("o que não é um relatório cai no primeiro", () => {
    expect(parseSalesReportView("catalog")).toBe("catalog")
    expect(parseSalesReportView("x")).toBe("items")
  })
})
