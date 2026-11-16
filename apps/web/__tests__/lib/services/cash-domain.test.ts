import { describe, it, expect } from "vitest"
import {
  cashTotals,
  expectedCashCents,
  planCashMovement,
  planCloseCash,
  planOpenCash,
  type CashTotals,
} from "@repo/db/src/domain/cash"

/**
 * A regra do caixa, testada sem banco (docs/ROADMAP.md, fase 2, fatia 2e).
 *
 * O que estes testes seguram: a conta do esperado na gaveta e a diferença do
 * fechamento, que é o número que o dono olha no fim do dia.
 */

const totals: CashTotals = {
  openingCents: 10000, // R$ 100,00 de troco
  supplyCents: 5000,
  saleCents: 32050,
  withdrawalCents: 20000,
}

describe("esperado no caixa", () => {
  it("inicial + suprimentos + vendas em dinheiro − sangrias", () => {
    expect(expectedCashCents(totals)).toBe(27050)
  })

  it("soma os movimentos por tipo a partir das strings do banco", () => {
    expect(
      cashTotals("100.00", [
        { kind: "supply", amount: "50.00" },
        { kind: "sale", amount: "120.50" },
        { kind: "sale", amount: "200.00" },
        { kind: "withdrawal", amount: "200.00" },
      ])
    ).toEqual(totals)
  })

  it("caixa sem movimento vale o saldo inicial", () => {
    expect(expectedCashCents(cashTotals("80.00", []))).toBe(8000)
  })
})

describe("planOpenCash", () => {
  it("aceita zero — caixa pode abrir sem troco", () => {
    expect(planOpenCash(0)).toEqual({ ok: true, openingAmount: "0.00" })
    expect(planOpenCash(150.5)).toEqual({ ok: true, openingAmount: "150.50" })
  })

  it("barra negativo e valor que não é número", () => {
    expect(planOpenCash(-1).ok).toBe(false)
    expect(planOpenCash(Number.NaN).ok).toBe(false)
  })
})

describe("planCashMovement", () => {
  it("suprimento entra com qualquer valor positivo", () => {
    const plan = planCashMovement({ kind: "supply", amount: 50, description: "  Troco  " }, totals)
    expect(plan).toEqual({ ok: true, kind: "supply", amount: "50.00", description: "Troco" })
  })

  it("sangria até o que há em caixa passa; acima é barrada e diz quanto há", () => {
    expect(planCashMovement({ kind: "withdrawal", amount: 270.5 }, totals).ok).toBe(true)

    const over = planCashMovement({ kind: "withdrawal", amount: 270.51 }, totals)
    expect(over.ok).toBe(false)
    if (!over.ok) expect(over.error).toContain("270,50")
  })

  it("barra valor zero, negativo e tipo desconhecido", () => {
    expect(planCashMovement({ kind: "supply", amount: 0 }, totals).ok).toBe(false)
    expect(planCashMovement({ kind: "withdrawal", amount: -5 }, totals).ok).toBe(false)
    // @ts-expect-error — 'sale' não é lançado na tela; entra pelo faturamento.
    expect(planCashMovement({ kind: "sale", amount: 10 }, totals).ok).toBe(false)
  })

  it("descrição vazia vira null", () => {
    const plan = planCashMovement({ kind: "supply", amount: 10, description: "   " }, totals)
    expect(plan.ok && plan.description).toBeNull()
  })
})

describe("planCloseCash", () => {
  it("contado igual ao esperado: diferença zero", () => {
    expect(planCloseCash(270.5, totals)).toEqual({
      ok: true,
      expectedAmount: "270.50",
      countedAmount: "270.50",
      difference: "0.00",
    })
  })

  it("sobra é diferença positiva; falta é negativa — e nenhuma impede fechar", () => {
    const over = planCloseCash(280, totals)
    expect(over.ok && over.difference).toBe("9.50")

    const short = planCloseCash(250, totals)
    expect(short.ok && short.difference).toBe("-20.50")
  })

  it("barra contado negativo", () => {
    expect(planCloseCash(-1, totals).ok).toBe(false)
  })
})
