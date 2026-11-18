import { describe, it, expect } from "vitest"
import {
  DEFAULT_REVIEW_TEXTS,
  buildReviewDashboard,
  planReviewResponse,
  planReviewSettings,
  reviewFormTexts,
  shouldRequestReview,
  type ReviewForDashboard,
} from "@repo/db/src/domain/reviews"

/**
 * A regra das avaliações pós-atendimento, testada sem banco (docs/ROADMAP.md,
 * fase 6, fatia 6c).
 *
 * O que estes testes seguram: a avaliação é do cliente e do atendimento. Só
 * comanda com serviço pede avaliação, responde-se uma vez só com nota inteira de
 * 1 a 5, e o painel não inventa média onde não há resposta.
 */

describe("planReviewSettings", () => {
  it("texto em branco vira NULL: o formulário usa o padrão", () => {
    expect(planReviewSettings({ isEnabled: true, title: "  ", welcomeText: "", thanksText: null })).toEqual({
      ok: true,
      settings: { isEnabled: true, title: null, welcomeText: null, thanksText: null },
    })
  })

  it("guarda os textos do salão, sem espaço nas pontas", () => {
    expect(
      planReviewSettings({ isEnabled: false, title: "  Conte pra gente  ", welcomeText: "Oi!", thanksText: "Valeu!" })
    ).toEqual({
      ok: true,
      settings: { isEnabled: false, title: "Conte pra gente", welcomeText: "Oi!", thanksText: "Valeu!" },
    })
  })

  it("recusa texto longo demais", () => {
    expect(planReviewSettings({ isEnabled: true, title: "a".repeat(81) }).ok).toBe(false)
    expect(planReviewSettings({ isEnabled: true, welcomeText: "a".repeat(301) }).ok).toBe(false)
    expect(planReviewSettings({ isEnabled: true, thanksText: "a".repeat(301) }).ok).toBe(false)
    expect(planReviewSettings({ isEnabled: true, title: "a".repeat(80) }).ok).toBe(true)
  })
})

describe("reviewFormTexts", () => {
  it("usa o texto do salão, ou o padrão", () => {
    expect(reviewFormTexts({ title: null, welcomeText: null, thanksText: null })).toEqual({
      title: DEFAULT_REVIEW_TEXTS.title,
      welcome: DEFAULT_REVIEW_TEXTS.welcome,
      thanks: DEFAULT_REVIEW_TEXTS.thanks,
    })
    expect(reviewFormTexts({ title: "Conte pra gente", welcomeText: null, thanksText: "Valeu!" })).toEqual({
      title: "Conte pra gente",
      welcome: DEFAULT_REVIEW_TEXTS.welcome,
      thanks: "Valeu!",
    })
  })
})

describe("shouldRequestReview", () => {
  const on = { moduleEnabled: true, settingsEnabled: true }

  it("só comanda com serviço pede avaliação", () => {
    expect(shouldRequestReview({ ...on, itemKinds: ["service"] })).toBe(true)
    expect(shouldRequestReview({ ...on, itemKinds: ["product", "service"] })).toBe(true)
    expect(shouldRequestReview({ ...on, itemKinds: ["product"] })).toBe(false)
    expect(shouldRequestReview({ ...on, itemKinds: ["package", "subscription"] })).toBe(false)
    expect(shouldRequestReview({ ...on, itemKinds: [] })).toBe(false)
  })

  it("precisa do módulo E das avaliações ativadas", () => {
    expect(shouldRequestReview({ moduleEnabled: false, settingsEnabled: true, itemKinds: ["service"] })).toBe(false)
    expect(shouldRequestReview({ moduleEnabled: true, settingsEnabled: false, itemKinds: ["service"] })).toBe(false)
  })
})

describe("planReviewResponse", () => {
  it("nota inteira de 1 a 5, comentário opcional", () => {
    expect(planReviewResponse({ rating: 5, comment: "  Adorei  ", alreadyResponded: false })).toEqual({
      ok: true,
      rating: 5,
      comment: "Adorei",
    })
    expect(planReviewResponse({ rating: 1, comment: "   ", alreadyResponded: false })).toEqual({
      ok: true,
      rating: 1,
      comment: null,
    })
  })

  it("recusa nota fora de 1 a 5, quebrada ou que não é número", () => {
    for (const rating of [0, 6, 4.5, Number.NaN, "5", null, undefined]) {
      expect(planReviewResponse({ rating, comment: null, alreadyResponded: false })).toEqual({
        ok: false,
        error: "Escolha uma nota de 1 a 5",
      })
    }
  })

  it("responde-se uma vez só", () => {
    expect(planReviewResponse({ rating: 5, comment: null, alreadyResponded: true })).toEqual({
      ok: false,
      error: "Esta avaliação já foi respondida",
    })
  })

  it("comentário tem teto", () => {
    expect(planReviewResponse({ rating: 5, comment: "a".repeat(1001), alreadyResponded: false }).ok).toBe(false)
    expect(planReviewResponse({ rating: 5, comment: "a".repeat(1000), alreadyResponded: false }).ok).toBe(true)
  })
})

describe("buildReviewDashboard", () => {
  const ana = { id: "pro-1", name: "Ana" }
  const bia = { id: "pro-2", name: "Bia" }
  const requestedAt = new Date("2026-11-17T12:00:00Z")

  function review(rating: number | null, hoursLater: number, professionals = [ana]): ReviewForDashboard {
    return {
      rating,
      requestedAt,
      respondedAt: rating === null ? null : new Date(requestedAt.getTime() + hoursLater * 3_600_000),
      professionals,
    }
  }

  it("sem pedido, tudo zerado e sem média inventada", () => {
    expect(buildReviewDashboard([])).toEqual({
      requested: 0,
      answered: 0,
      average: null,
      responseRate: 0,
      averageResponseHours: null,
      distribution: [0, 0, 0, 0, 0],
      professionals: [],
    })
  })

  it("só pendentes: taxa zero, sem média", () => {
    const dashboard = buildReviewDashboard([review(null, 0), review(null, 0)])
    expect(dashboard).toMatchObject({ requested: 2, answered: 0, average: null, responseRate: 0 })
  })

  it("média, taxa, tempo de resposta e distribuição", () => {
    const dashboard = buildReviewDashboard([review(5, 2), review(4, 4), review(2, 6), review(null, 0)])

    expect(dashboard.requested).toBe(4)
    expect(dashboard.answered).toBe(3)
    // (5 + 4 + 2) ÷ 3 = 3,67 → 3,7
    expect(dashboard.average).toBe(3.7)
    expect(dashboard.responseRate).toBe(75)
    // (2 + 4 + 6) ÷ 3 = 4 h
    expect(dashboard.averageResponseHours).toBe(4)
    expect(dashboard.distribution).toEqual([0, 1, 0, 1, 1])
  })

  it("a nota conta para cada profissional da comanda; a melhor média vem primeiro", () => {
    const dashboard = buildReviewDashboard([
      review(5, 1, [ana, bia]),
      review(3, 1, [ana]),
      // Pendente não entra na conta de ninguém.
      review(null, 0, [bia]),
    ])

    expect(dashboard.professionals).toEqual([
      { id: "pro-2", name: "Bia", answered: 1, average: 5 },
      { id: "pro-1", name: "Ana", answered: 2, average: 4 },
    ])
  })

  it("comanda sem profissional identificado entra na média geral", () => {
    const dashboard = buildReviewDashboard([review(4, 1, [])])
    expect(dashboard).toMatchObject({ answered: 1, average: 4, professionals: [] })
  })
})
