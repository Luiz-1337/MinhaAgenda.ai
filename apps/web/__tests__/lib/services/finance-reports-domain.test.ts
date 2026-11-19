import { describe, it, expect } from "vitest"
import {
  allocateByWeight,
  buildAccountStatement,
  buildNetResult,
  buildRevenueProjection,
  parseFinanceReportView,
  planProjectionPeriod,
  type NetResultItem,
} from "@repo/db/src/domain/finance-reports"

/**
 * Os relatórios financeiros, testados sem banco (docs/ROADMAP.md, fase 9, fatia 9b).
 *
 * O que estes testes seguram: a taxa da comanda é repartida sem perder centavo, o
 * resultado é receita − taxa − comissão − custo, a projeção soma por dia e o
 * extrato carrega o saldo.
 */

const item = (over: Partial<NetResultItem>): NetResultItem => ({
  saleId: "s1",
  kind: "service",
  refId: "corte",
  name: "Corte",
  quantity: 1,
  totalCents: 10000,
  commissionCents: 0,
  unitCostCents: 0,
  saleFeeCents: 0,
  ...over,
})

describe("allocateByWeight", () => {
  it("reparte na proporção e a soma fecha no centavo", () => {
    expect(allocateByWeight(1000, [1, 1])).toEqual([500, 500])
    expect(allocateByWeight(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocateByWeight(999, [7000, 3000])).toEqual([699, 300])
    const shares = allocateByWeight(12345, [3333, 3333, 3334, 1])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(12345)
  })

  it("sem peso ou sem valor, ninguém leva nada", () => {
    expect(allocateByWeight(500, [0, 0])).toEqual([0, 0])
    expect(allocateByWeight(0, [10, 20])).toEqual([0, 0])
    expect(allocateByWeight(500, [])).toEqual([])
    // Peso negativo conta como zero.
    expect(allocateByWeight(100, [-50, 100])).toEqual([0, 100])
  })
})

describe("buildNetResult", () => {
  it("resultado = receita − taxa − comissão − custo, somando o mesmo serviço em várias comandas", () => {
    const report = buildNetResult(
      [
        item({ saleId: "s1", totalCents: 10000, commissionCents: 4000, unitCostCents: 500, saleFeeCents: 300 }),
        item({ saleId: "s2", totalCents: 8000, commissionCents: 3200, unitCostCents: 500, saleFeeCents: 0 }),
      ],
      "service"
    )
    expect(report.rows).toEqual([
      {
        key: "corte",
        name: "Corte",
        quantity: 2,
        revenueCents: 18000,
        feeCents: 300,
        commissionCents: 7200,
        costCents: 1000,
        netCents: 9500,
        marginPercent: 52.8,
        costMissing: false,
      },
    ])
    expect(report.totals).toMatchObject({ revenueCents: 18000, netCents: 9500, marginPercent: 52.8 })
  })

  it("a taxa da comanda é repartida entre TODOS os itens dela, e cada relatório fica com a sua parte", () => {
    const items = [
      item({ saleFeeCents: 400, totalCents: 15000 }),
      item({ saleFeeCents: 400, kind: "product", refId: "shampoo", name: "Shampoo", totalCents: 5000, unitCostCents: 2000 }),
    ]
    expect(buildNetResult(items, "service").rows[0].feeCents).toBe(300)
    const products = buildNetResult(items, "product")
    expect(products.rows[0]).toMatchObject({ feeCents: 100, costCents: 2000, netCents: 2900 })
    // O serviço não aparece no relatório de produtos.
    expect(products.rows).toHaveLength(1)
  })

  it("custo × quantidade; produto sem custo avisa em vez de inventar", () => {
    const report = buildNetResult(
      [
        item({ kind: "product", refId: "p1", name: "Pente", quantity: 3, totalCents: 6000, unitCostCents: 1250 }),
        item({ kind: "product", refId: "p2", name: "Creme", quantity: 1, totalCents: 4000, unitCostCents: null }),
      ],
      "product"
    )
    const byKey = Object.fromEntries(report.rows.map((row) => [row.key, row]))
    expect(byKey.p1).toMatchObject({ costCents: 3750, netCents: 2250, costMissing: false })
    expect(byKey.p2).toMatchObject({ costCents: 0, netCents: 4000, costMissing: true })
  })

  it("quem mais rendeu vem primeiro; item de pacote (receita zero) fica com margem em branco", () => {
    const report = buildNetResult(
      [
        item({ saleId: "s1", refId: "a", name: "A", totalCents: 5000 }),
        item({ saleId: "s2", refId: "b", name: "B", totalCents: 9000 }),
        item({ saleId: "s3", refId: "c", name: "C", totalCents: 0, commissionCents: 2000 }),
      ],
      "service"
    )
    expect(report.rows.map((row) => row.key)).toEqual(["b", "a", "c"])
    expect(report.rows[2]).toMatchObject({ netCents: -2000, marginPercent: null })
  })

  it("item sem vínculo com o catálogo agrupa pelo nome", () => {
    const report = buildNetResult(
      [item({ saleId: "s1", refId: null, name: "Avulso" }), item({ saleId: "s2", refId: null, name: "Avulso" })],
      "service"
    )
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0]).toMatchObject({ key: "name:Avulso", quantity: 2 })
  })

  it("sem itens: tudo zero", () => {
    expect(buildNetResult([], "service")).toEqual({
      rows: [],
      totals: { quantity: 0, revenueCents: 0, feeCents: 0, commissionCents: 0, costCents: 0, netCents: 0, marginPercent: null },
    })
  })
})

describe("projeção de faturamento", () => {
  // 19/nov/2026, 10:00 em Brasília.
  const now = new Date("2026-11-19T13:00:00Z")

  it("começa hoje; sem data, 30 dias; não olha para trás nem longe demais", () => {
    expect(planProjectionPeriod({}, now)).toEqual({ ok: true, from: "2026-11-19", to: "2026-12-19" })
    expect(planProjectionPeriod({ to: "2026-11-19" }, now)).toEqual({ ok: true, from: "2026-11-19", to: "2026-11-19" })
    expect(planProjectionPeriod({ to: "2026-11-18" }, now)).toEqual({ ok: false, error: "A projeção é de hoje em diante" })
    expect(planProjectionPeriod({ to: "2027-03-19" }, now).ok).toBe(true)
    expect(planProjectionPeriod({ to: "2027-03-20" }, now)).toEqual({
      ok: false,
      error: "A projeção vai até 120 dias à frente",
    })
    expect(planProjectionPeriod({ to: "amanhã" }, now)).toEqual({ ok: false, error: "Data inválida" })
  })

  it("soma por dia: agendado + a receber − a pagar; sem preço conta, mas não soma", () => {
    const report = buildRevenueProjection({
      appointments: [
        { day: "2026-11-20", priceCents: 17000 },
        { day: "2026-11-20", priceCents: null },
        { day: "2026-11-22", priceCents: 8000 },
      ],
      receivables: [{ day: "2026-11-20", cents: 5000 }],
      payables: [
        { day: "2026-11-21", cents: 30000 },
        { day: "2026-11-20", cents: 1000 },
      ],
    })
    expect(report.days).toEqual([
      { day: "2026-11-20", appointments: 2, unpriced: 1, scheduledCents: 17000, receivableCents: 5000, payableCents: 1000, netCents: 21000 },
      { day: "2026-11-21", appointments: 0, unpriced: 0, scheduledCents: 0, receivableCents: 0, payableCents: 30000, netCents: -30000 },
      { day: "2026-11-22", appointments: 1, unpriced: 0, scheduledCents: 8000, receivableCents: 0, payableCents: 0, netCents: 8000 },
    ])
    expect(report.totals).toEqual({
      appointments: 3,
      unpriced: 1,
      scheduledCents: 25000,
      receivableCents: 5000,
      payableCents: 31000,
      netCents: -1000,
    })
  })

  it("sem nada: nenhum dia", () => {
    expect(buildRevenueProjection({ appointments: [], receivables: [], payables: [] }).days).toEqual([])
  })
})

describe("extrato de conta", () => {
  it("carrega o saldo, linha a linha, a partir do saldo anterior", () => {
    const statement = buildAccountStatement({
      openingCents: 100000,
      entries: [
        { id: "1", day: "2026-11-02", description: "Comanda #1", direction: "in", netCents: 9700 },
        { id: "2", day: "2026-11-03", description: "Aluguel", direction: "out", netCents: 150000 },
        { id: "3", day: "2026-11-03", description: "Transferência", direction: "in", netCents: 50000 },
      ],
    })
    expect(statement.rows.map((row) => row.balanceCents)).toEqual([109700, -40300, 9700])
    expect(statement).toMatchObject({ openingCents: 100000, inCents: 59700, outCents: 150000, closingCents: 9700 })
  })

  it("sem baixas, o saldo final é o anterior", () => {
    expect(buildAccountStatement({ openingCents: -500, entries: [] })).toEqual({
      openingCents: -500,
      rows: [],
      inCents: 0,
      outCents: 0,
      closingCents: -500,
    })
  })
})

describe("qual relatório", () => {
  it("o que não é um relatório cai no primeiro", () => {
    expect(parseFinanceReportView("statement")).toBe("statement")
    expect(parseFinanceReportView("outro")).toBe("services")
    expect(parseFinanceReportView(undefined)).toBe("services")
  })
})
