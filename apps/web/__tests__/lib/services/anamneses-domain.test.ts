import { describe, it, expect } from "vitest"
import {
  formatAnamnesisAnswer,
  parseAnamnesisAnswers,
  parseAnamnesisQuestions,
  planAnamnesisAnswers,
  planAnamnesisTemplate,
  type AnamnesisQuestion,
} from "@repo/db/src/domain/anamneses"

/**
 * A regra das anamneses, testada sem banco (docs/ROADMAP.md, fase 7, fatia 7d).
 *
 * O que estes testes seguram: o modelo só é gravado bem formado, a resposta só
 * entra se couber na pergunta, pergunta obrigatória não passa em branco, e a
 * ficha respondida guarda o texto da pergunta (o retrato).
 */

const question = (over: Partial<AnamnesisQuestion> & { id: string }): AnamnesisQuestion => ({
  label: `Pergunta ${over.id}`,
  type: "text",
  required: false,
  options: [],
  ...over,
})

describe("planAnamnesisTemplate", () => {
  it("normaliza nome, perguntas e opções, e dá id às perguntas novas", () => {
    expect(
      planAnamnesisTemplate({
        name: "  Anamnese   capilar ",
        questions: [
          { label: " Tem  alergia? ", type: "yes_no", required: true, options: ["sobra"] },
          { label: "Tipo de cabelo", type: "single_choice", required: false, options: [" Oleoso ", "", "Seco"] },
        ],
      })
    ).toEqual({
      ok: true,
      template: {
        name: "Anamnese capilar",
        questions: [
          { id: "q1", label: "Tem alergia?", type: "yes_no", required: true, options: [] },
          { id: "q2", label: "Tipo de cabelo", type: "single_choice", required: false, options: ["Oleoso", "Seco"] },
        ],
      },
    })
  })

  it("mantém o id de quem já tinha e não repete id", () => {
    const plan = planAnamnesisTemplate({
      name: "Modelo",
      questions: [
        { label: "Nova", type: "text", required: false, options: [] },
        { id: "q1", label: "Antiga", type: "text", required: false, options: [] },
        { id: "q1", label: "Cópia", type: "text", required: false, options: [] },
        { id: "ID inválido", label: "Outra", type: "text", required: false, options: [] },
      ],
    })
    expect(plan.ok && plan.template.questions.map((q) => q.id)).toEqual(["q2", "q1", "q3", "q4"])
  })

  it("recusa modelo sem nome, sem pergunta ou com pergunta mal formada", () => {
    const ok = { label: "Pergunta", type: "text", required: false, options: [] }
    const error = (draft: { name: unknown; questions: unknown }) => {
      const plan = planAnamnesisTemplate(draft)
      return plan.ok ? null : plan.error
    }

    expect(error({ name: " ", questions: [ok] })).toBe("Dê um nome ao modelo")
    expect(error({ name: "x".repeat(81), questions: [ok] })).toBe("O nome do modelo tem até 80 caracteres")
    expect(error({ name: "Modelo", questions: [] })).toBe("O modelo precisa de ao menos uma pergunta")
    expect(error({ name: "Modelo", questions: "nada" })).toBe("O modelo precisa de ao menos uma pergunta")
    expect(error({ name: "Modelo", questions: Array(41).fill(ok) })).toBe("O modelo tem até 40 perguntas")
    expect(error({ name: "Modelo", questions: [{ ...ok, label: "" }] })).toBe("Escreva o texto da pergunta 1")
    expect(error({ name: "Modelo", questions: [ok, { ...ok, type: "data" }] })).toBe("Escolha o tipo da pergunta 2")
    expect(error({ name: "Modelo", questions: [null] })).toBe("Pergunta 1 inválida")
  })

  it("pergunta de opção precisa de 2 a 20 opções, sem repetir", () => {
    const error = (options: unknown) => {
      const plan = planAnamnesisTemplate({
        name: "Modelo",
        questions: [{ label: "Pergunta", type: "multiple_choice", required: false, options }],
      })
      return plan.ok ? null : plan.error
    }

    expect(error(["Só uma"])).toBe("A pergunta 1 precisa de ao menos 2 opções")
    expect(error(undefined)).toBe("A pergunta 1 precisa de ao menos 2 opções")
    expect(error(["Seco", "seco"])).toBe('A pergunta 1 tem a opção "seco" repetida')
    expect(error(Array.from({ length: 21 }, (_, i) => `Opção ${i}`))).toBe("A pergunta 1 tem até 20 opções")
    expect(error(["A", "B"])).toBeNull()
  })
})

describe("planAnamnesisAnswers", () => {
  const questions = [
    question({ id: "q1", label: "Tem alergia?", type: "yes_no", required: true }),
    question({ id: "q2", label: "Qual?", type: "text" }),
    question({ id: "q3", label: "Tipo de cabelo", type: "single_choice", options: ["Oleoso", "Seco"] }),
    question({ id: "q4", label: "Químicas", type: "multiple_choice", options: ["Tintura", "Alisamento", "Luzes"] }),
    question({ id: "q5", label: "Observações", type: "long_text" }),
  ]

  it("monta o retrato: texto da pergunta, tipo e resposta; em branco vira null", () => {
    expect(
      planAnamnesisAnswers(questions, {
        q1: false,
        q2: "   ",
        q3: "Seco",
        q4: ["Luzes", "Tintura", "Luzes"],
        qX: "pergunta que não existe",
      })
    ).toEqual({
      ok: true,
      answers: [
        { questionId: "q1", label: "Tem alergia?", type: "yes_no", value: false },
        { questionId: "q2", label: "Qual?", type: "text", value: null },
        { questionId: "q3", label: "Tipo de cabelo", type: "single_choice", value: "Seco" },
        // Na ordem do modelo, sem repetição.
        { questionId: "q4", label: "Químicas", type: "multiple_choice", value: ["Tintura", "Luzes"] },
        { questionId: "q5", label: "Observações", type: "long_text", value: null },
      ],
    })
  })

  it("pergunta obrigatória não passa em branco — e 'Não' é resposta", () => {
    expect(planAnamnesisAnswers(questions, { q2: "Amônia" })).toEqual({ ok: false, error: 'Responda: "Tem alergia?"' })
    expect(planAnamnesisAnswers(questions, { q1: "sim" })).toEqual({ ok: false, error: 'Responda: "Tem alergia?"' })
    expect(planAnamnesisAnswers(questions, { q1: false }).ok).toBe(true)
  })

  it("recusa opção que não está no modelo e texto longo demais", () => {
    expect(planAnamnesisAnswers(questions, { q1: true, q3: "Cacheado" })).toEqual({
      ok: false,
      error: 'Escolha uma das opções de "Tipo de cabelo"',
    })
    expect(planAnamnesisAnswers(questions, { q1: true, q4: ["Tintura", "Botox"] })).toEqual({
      ok: false,
      error: 'Escolha entre as opções de "Químicas"',
    })
    expect(planAnamnesisAnswers(questions, { q1: true, q2: "x".repeat(201) })).toEqual({
      ok: false,
      error: 'A resposta de "Qual?" tem até 200 caracteres',
    })
    expect(planAnamnesisAnswers(questions, { q1: true, q5: "x".repeat(2000) }).ok).toBe(true)
  })

  it("ficha toda em branco não é gravada", () => {
    const optional = [question({ id: "q1" }), question({ id: "q2", type: "yes_no" })]
    for (const raw of [{}, null, "texto", [], { q1: "" }]) {
      expect(planAnamnesisAnswers(optional, raw)).toEqual({ ok: false, error: "Responda ao menos uma pergunta" })
    }
  })
})

describe("leitura do que está gravado", () => {
  it("descarta o que não tem formato de pergunta ou de resposta, sem lançar", () => {
    expect(parseAnamnesisQuestions("nada")).toEqual([])
    expect(
      parseAnamnesisQuestions([null, { id: "q1", label: "Ok", type: "text" }, { id: "q2", label: "Tipo ruim", type: "x" }])
    ).toEqual([{ id: "q1", label: "Ok", type: "text", required: false, options: [] }])

    expect(parseAnamnesisAnswers({})).toEqual([])
    expect(
      parseAnamnesisAnswers([
        { questionId: "q1", label: "Alergia?", type: "yes_no", value: true },
        { questionId: "q2", label: "Químicas", type: "multiple_choice", value: ["Luzes", 3] },
        { questionId: "q3", label: "Número", type: "text", value: 42 },
        { label: 1, type: "text", value: "sem pergunta" },
      ])
    ).toEqual([
      { questionId: "q1", label: "Alergia?", type: "yes_no", value: true },
      { questionId: "q2", label: "Químicas", type: "multiple_choice", value: ["Luzes"] },
      { questionId: "q3", label: "Número", type: "text", value: null },
    ])
  })

  it("a resposta em texto", () => {
    expect(formatAnamnesisAnswer(true)).toBe("Sim")
    expect(formatAnamnesisAnswer(false)).toBe("Não")
    expect(formatAnamnesisAnswer(["Tintura", "Luzes"])).toBe("Tintura, Luzes")
    expect(formatAnamnesisAnswer([])).toBe("—")
    expect(formatAnamnesisAnswer(null)).toBe("—")
    expect(formatAnamnesisAnswer("Amônia")).toBe("Amônia")
  })
})
