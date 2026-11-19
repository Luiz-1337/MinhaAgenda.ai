import { describe, it, expect } from "vitest"
import {
  MAX_REPORT_INSIGHT_INPUT,
  REPORT_INSIGHTS_JSON_SCHEMA,
  parseReportInsightScreen,
  parseReportInsights,
  planReportInsightInput,
} from "@repo/db/src/domain/report-insights"

/**
 * A análise com IA dos relatórios, testada sem IA nem banco (docs/ROADMAP.md,
 * fase 9, fatia 9h).
 *
 * O que estes testes seguram: o que sai para a IA não leva contato, nome de
 * cliente nem texto livre, cabe no limite e resume listas longas; e o que volta
 * da IA só chega à tela conferido.
 */

function plan(data: unknown, dropKeys: string[] = []) {
  const result = planReportInsightInput(data, { dropKeys })
  if (!result.ok) throw new Error(result.error)
  return JSON.parse(result.json)
}

describe("planReportInsightInput", () => {
  it("tira contato, documento, identificador, texto livre e nome de cliente", () => {
    const out = plan({
      view: "all",
      rows: [
        {
          id: "a1",
          customerId: "c1",
          customerName: "Cliente Teste",
          phone: "11900000000",
          email: "x@exemplo.test",
          notes: "ligar depois",
          description: "Comanda #1 — Cliente Teste",
          cancelReason: "doente",
          serviceName: "Corte",
          professionalName: "Profissional Teste",
          status: "completed",
        },
      ],
    })
    expect(out).toEqual({
      view: "all",
      rows: [{ serviceName: "Corte", professionalName: "Profissional Teste", status: "completed" }],
    })
  })

  it("tira o `name` só quando a tela diz que é cliente", () => {
    const rows = [{ name: "Cliente Teste", daysAway: 90, visits: 3 }]
    expect(plan({ rows })).toEqual({ rows: [{ name: "Cliente Teste", daysAway: 90, visits: 3 }] })
    expect(plan({ rows }, ["name"])).toEqual({ rows: [{ daysAway: 90, visits: 3 }] })
  })

  it("dinheiro em centavos vira reais; minutos viram horas; número em texto vira número", () => {
    expect(plan({ totals: { revenueCents: 123456, feeCents: 0 }, total: "170.00" })).toEqual({
      totals: { revenueReais: 1234.56, feeReais: 0 },
      total: 170,
    })
    expect(plan({ totals: { bookedMinutes: 300, availableMinutes: 66720, slotMinutes: 45 } })).toEqual({
      totals: { bookedHoras: 5, availableHoras: 1112, slotHoras: 0.8 },
    })
  })

  it("lista longa vira resumo por coluna, com amostra", () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      day: index % 2 === 0 ? "2026-11-16" : "2026-11-17",
      time: index % 2 === 0 ? "09:30" : "14:00",
      status: index < 30 ? "completed" : "cancelled",
      priceCents: 10000,
    }))
    const out = plan({ rows })
    expect(out.rows.total).toBe(40)
    expect(out.rows.colunas.status).toEqual({
      valoresDiferentes: 2,
      maisFrequentes: { completed: 30, cancelled: 10 },
    })
    expect(out.rows.colunas.priceReais).toEqual({ soma: 4000, media: 100, min: 100, max: 100 })
    // 16/11/2026 é segunda; 17/11/2026, terça.
    expect(out.rows.colunas.day).toEqual({ de: "2026-11-16", ate: "2026-11-17", porDiaDaSemana: { seg: 20, ter: 20 } })
    expect(out.rows.colunas.time).toEqual({ porHora: { "09h": 20, "14h": 20 } })
    expect(out.rows.amostra).toHaveLength(10)
  })

  it("lista curta vai inteira", () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ name: `Serviço ${index}`, quantity: index }))
    expect(plan({ rows }).rows).toHaveLength(5)
  })

  it("cabe no limite: tira a amostra antes de desistir", () => {
    const rows = Array.from({ length: 400 }, (_, index) => ({
      serviceName: `Serviço com um nome comprido de propósito ${index}`,
      professionalName: `Profissional ${index}`,
      day: "2026-11-16",
      amountCents: index * 100,
    }))
    const result = planReportInsightInput({ rows })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.json.length).toBeLessThanOrEqual(MAX_REPORT_INSIGHT_INPUT)
  })

  it("tela sem número nenhum não vai para a IA", () => {
    expect(planReportInsightInput({ rows: [] })).toEqual({ ok: false, error: "Não há números nesta tela para analisar" })
    expect(planReportInsightInput({ rows: [{ phone: "1" }] }).ok).toBe(false)
  })

  it("texto longo é cortado e Set/Map são ignorados", () => {
    const out = plan({ label: "x".repeat(200), ids: new Set(["a"]), extra: new Map(), count: 2 })
    expect(out.label).toHaveLength(81)
    expect(out).not.toHaveProperty("ids")
    expect(out).not.toHaveProperty("extra")
    expect(out.count).toBe(2)
  })
})

describe("parseReportInsights", () => {
  const valid = {
    summary: "  O mês teve 40 atendimentos.  ",
    highlights: [{ title: "Terça cheia", detail: "20 de 40 atendimentos foram na terça." }],
    warnings: [{ title: "Cancelamentos", detail: "10 de 40, 25%." }],
    actions: [{ title: "Confirmar na véspera", detail: "Mande lembrete.", impact: "alto" }],
  }

  it("aceita a resposta e apara os espaços", () => {
    const result = parseReportInsights(JSON.stringify(valid))
    expect(result).toEqual({
      ok: true,
      insights: {
        summary: "O mês teve 40 atendimentos.",
        highlights: valid.highlights,
        warnings: valid.warnings,
        actions: valid.actions,
      },
    })
  })

  it("impacto desconhecido vira médio; item sem título sai; no máximo 5 por lista", () => {
    const result = parseReportInsights(
      JSON.stringify({
        ...valid,
        actions: [
          { title: "A", detail: "x", impact: "enorme" },
          { title: "", detail: "sem título", impact: "alto" },
          ...Array.from({ length: 8 }, (_, index) => ({ title: `B${index}`, detail: "y", impact: "baixo" })),
        ],
      })
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.insights.actions[0]).toEqual({ title: "A", detail: "x", impact: "medio" })
    expect(result.insights.actions).toHaveLength(5)
  })

  it("recusa o que não é análise", () => {
    expect(parseReportInsights("não é json").ok).toBe(false)
    expect(parseReportInsights("[]").ok).toBe(false)
    expect(parseReportInsights(JSON.stringify({ summary: "", highlights: [], warnings: [], actions: [] }))).toEqual({
      ok: false,
      error: "A IA não devolveu análise",
    })
  })

  it("o formato pedido à IA é estrito: todo campo obrigatório, nada além", () => {
    expect(REPORT_INSIGHTS_JSON_SCHEMA.additionalProperties).toBe(false)
    expect([...REPORT_INSIGHTS_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(REPORT_INSIGHTS_JSON_SCHEMA.properties).sort()
    )
    const action = REPORT_INSIGHTS_JSON_SCHEMA.properties.actions.items
    expect([...action.required].sort()).toEqual(Object.keys(action.properties).sort())
  })
})

describe("parseReportInsightScreen", () => {
  it("só as telas com análise", () => {
    expect(parseReportInsightScreen("finance")).toBe("finance")
    expect(parseReportInsightScreen("organization")).toBeNull()
    expect(parseReportInsightScreen(undefined)).toBeNull()
  })
})
