import { describe, it, expect } from "vitest"
import {
  buildGoalBoard,
  currentGoalMonth,
  goalMonthRange,
  goalProgress,
  isGoalMonth,
  planGoalCopy,
  planGoalTargets,
  shiftGoalMonth,
  type GoalAchieved,
} from "@repo/db/src/domain/goals"

/**
 * A regra das metas por mês, testada sem banco (docs/ROADMAP.md, fase 6,
 * fatia 6e).
 *
 * O que estes testes seguram: meta é número positivo ou não existe, copiar nunca
 * passa por cima do que o mês já tem, e o quadro não diz que bateu a meta por
 * arredondamento.
 */

describe("o mês", () => {
  it("aceita só YYYY-MM de um mês que existe", () => {
    expect(isGoalMonth("2026-11")).toBe(true)
    expect(isGoalMonth("2026-13")).toBe(false)
    expect(isGoalMonth("2026-00")).toBe(false)
    expect(isGoalMonth("2026-1")).toBe(false)
    expect(isGoalMonth("1999-12")).toBe(false)
    expect(isGoalMonth(null)).toBe(false)
  })

  it("o mês corrente é o de Brasília, não o de UTC", () => {
    // 01/dez 02h UTC ainda é 30/nov 23h em Brasília.
    expect(currentGoalMonth(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11")
    expect(currentGoalMonth(new Date("2026-12-01T03:00:00Z"))).toBe("2026-12")
  })

  it("anda para frente e para trás, virando o ano", () => {
    expect(shiftGoalMonth("2026-11", 1)).toBe("2026-12")
    expect(shiftGoalMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftGoalMonth("2027-01", -1)).toBe("2026-12")
    expect(shiftGoalMonth("2026-03", -14)).toBe("2025-01")
  })

  it("primeiro e último dia, com fevereiro bissexto", () => {
    expect(goalMonthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30", days: 30 })
    expect(goalMonthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29", days: 29 })
    expect(goalMonthRange("2026-02").days).toBe(28)
  })
})

describe("planGoalTargets", () => {
  it("grava valor positivo; dinheiro com duas casas, comandas inteiras", () => {
    expect(planGoalTargets({ revenue: 10000, services: 7500.5, sales_count: 120 })).toEqual({
      ok: true,
      upserts: [
        { metric: "revenue", target: "10000.00" },
        { metric: "services", target: "7500.50" },
        { metric: "sales_count", target: "120" },
      ],
      deletes: [],
    })
  })

  it("em branco ou zero apaga a meta; indicador ausente fica como está", () => {
    expect(planGoalTargets({ revenue: null, products: 0 })).toEqual({
      ok: true,
      upserts: [],
      deletes: ["revenue", "products"],
    })
    expect(planGoalTargets({})).toEqual({ ok: true, upserts: [], deletes: [] })
  })

  it("recusa negativo, não número, comandas quebradas e valor absurdo", () => {
    expect(planGoalTargets({ revenue: -1 }).ok).toBe(false)
    expect(planGoalTargets({ revenue: Number.NaN }).ok).toBe(false)
    expect(planGoalTargets({ sales_count: 10.5 })).toEqual({ ok: false, error: "A meta de comandas é um número inteiro" })
    expect(planGoalTargets({ sales_count: 100_000 }).ok).toBe(false)
    expect(planGoalTargets({ revenue: 100_000_000 }).ok).toBe(false)
  })

  it("menos de um centavo não é meta", () => {
    expect(planGoalTargets({ revenue: 0.001 })).toEqual({ ok: true, upserts: [], deletes: ["revenue"] })
  })
})

describe("planGoalCopy", () => {
  const source = [
    { professionalId: null, metric: "revenue" as const, target: "10000.00" },
    { professionalId: "pro-1", metric: "services" as const, target: "4000.00" },
    { professionalId: "pro-2", metric: "services" as const, target: "3000.00" },
  ]

  it("copia tudo para um mês vazio", () => {
    expect(
      planGoalCopy({
        fromMonth: "2026-10",
        toMonth: "2026-11",
        source,
        existing: [],
        activeProfessionalIds: ["pro-1", "pro-2"],
      })
    ).toEqual({ ok: true, goals: source, skipped: 0 })
  })

  it("não passa por cima do que o destino já tem, nem copia meta de quem saiu", () => {
    const plan = planGoalCopy({
      fromMonth: "2026-10",
      toMonth: "2026-11",
      source,
      existing: [{ professionalId: null, metric: "revenue" }],
      activeProfessionalIds: ["pro-1"],
    })
    expect(plan).toEqual({ ok: true, goals: [source[1]], skipped: 2 })
  })

  it("recusa o mesmo mês, mês inválido e origem sem metas", () => {
    const base = { source, existing: [], activeProfessionalIds: [] }
    expect(planGoalCopy({ ...base, fromMonth: "2026-11", toMonth: "2026-11" }).ok).toBe(false)
    expect(planGoalCopy({ ...base, fromMonth: "2026-13", toMonth: "2026-11" }).ok).toBe(false)
    expect(planGoalCopy({ ...base, source: [], fromMonth: "2026-10", toMonth: "2026-11" })).toEqual({
      ok: false,
      error: "O mês escolhido não tem metas para copiar",
    })
  })
})

describe("goalProgress", () => {
  const month = "2026-11" // 30 dias

  it("mês em curso: o esperado é linear pelos dias corridos", () => {
    const progress = goalProgress({ target: 30_000, achieved: 12_000, month, today: "2026-11-10" })
    expect(progress).toEqual({
      target: 30_000,
      achieved: 12_000,
      remaining: 18_000,
      percent: 40,
      expected: 10_000,
      pace: "on_track",
    })
    expect(goalProgress({ target: 30_000, achieved: 9_999, month, today: "2026-11-10" }).pace).toBe("behind")
  })

  it("99,9% não é 100%: só bate quem alcança", () => {
    const almost = goalProgress({ target: 100_000, achieved: 99_999, month, today: "2026-11-30" })
    expect(almost.percent).toBe(99)
    expect(almost.pace).toBe("behind")
    expect(goalProgress({ target: 100_000, achieved: 100_000, month, today: "2026-11-30" }).pace).toBe("reached")
  })

  it("mês encerrado sem bater, mês que não começou, e meta batida em qualquer tempo", () => {
    expect(goalProgress({ target: 1000, achieved: 500, month, today: "2026-12-01" })).toMatchObject({
      pace: "missed",
      expected: 1000,
    })
    expect(goalProgress({ target: 1000, achieved: 0, month, today: "2026-10-31" })).toMatchObject({
      pace: "upcoming",
      expected: 0,
    })
    expect(goalProgress({ target: 1000, achieved: 2500, month, today: "2026-12-15" })).toMatchObject({
      pace: "reached",
      remaining: 0,
      percent: 250,
    })
  })
})

describe("buildGoalBoard", () => {
  const achieved = (values: Partial<GoalAchieved>): GoalAchieved => ({
    revenue: 0,
    services: 0,
    products: 0,
    sales_count: 0,
    ...values,
  })

  it("o salão primeiro, depois os profissionais por nome; meta em reais vira centavos", () => {
    const board = buildGoalBoard({
      month: "2026-11",
      today: "2026-11-15",
      owners: [
        { professionalId: "pro-2", name: "Zeca" },
        { professionalId: null, name: "Salão" },
        { professionalId: "pro-1", name: "Ana" },
      ],
      goals: [
        { professionalId: null, metric: "revenue", target: "10000.00" },
        { professionalId: "pro-1", metric: "sales_count", target: "40.00" },
      ],
      achieved: new Map<string | null, GoalAchieved>([
        [null, achieved({ revenue: 600_000, sales_count: 30 })],
        ["pro-1", achieved({ sales_count: 12 })],
      ]),
    })

    expect(board.map((row) => row.name)).toEqual(["Salão", "Ana", "Zeca"])

    expect(board[0].metrics.revenue.progress).toMatchObject({ target: 1_000_000, achieved: 600_000, percent: 60 })
    // Sem meta, o realizado aparece mesmo assim.
    expect(board[0].metrics.sales_count).toEqual({ achieved: 30, progress: null })

    expect(board[1].metrics.sales_count.progress).toMatchObject({ target: 40, achieved: 12, percent: 30 })

    // Quem não vendeu nada no mês aparece zerado.
    expect(board[2].metrics.revenue).toEqual({ achieved: 0, progress: null })
  })
})
