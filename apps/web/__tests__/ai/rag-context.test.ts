import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted: as fns precisam existir ANTES das fábricas vi.mock (que são içadas).
const h = vi.hoisted(() => ({ pg: vi.fn(), embeddingsCreate: vi.fn() }))

vi.mock("@repo/db", () => ({ postgresClient: h.pg }))
vi.mock("@/lib/services/ai/openai-client", () => ({
  getOpenAIClient: () => ({ embeddings: { create: h.embeddingsCreate } }),
}))

import {
  findRelevantContext,
  resolveRagSettings,
  searchWithEmbedding,
} from "@/lib/services/ai/rag-context.service"

/**
 * O Treinamento entra por semelhança, e a busca era muda: não havia como saber
 * quais itens entraram nem se o corte estava alto demais. Agora a busca devolve os
 * mais parecidos com a nota, entrando ou não, e diz POR QUE falhou quando falha.
 */

const rows = [
  { id: "kb-metro", content: "Metrô Vila Mariana", metadata: null, similarity: 0.81 },
  { id: "kb-duracao", content: "Nunca informe a duração", metadata: null, similarity: 0.52 },
  { id: "kb-pix", content: "Desconto de 5% no pix", metadata: null, similarity: 0.31 },
]

describe("searchWithEmbedding", () => {
  beforeEach(() => {
    h.pg.mockReset()
  })

  it("devolve só quem passou do corte em `data`, e todos os candidatos com a nota", async () => {
    h.pg.mockResolvedValue(rows)

    const result = await searchWithEmbedding("agent-1", [0.1, 0.2], 5, 0.65)

    expect(result).toEqual({
      success: true,
      data: [{ id: "kb-metro", content: "Metrô Vila Mariana", similarity: 0.81, metadata: null }],
      candidates: [
        { id: "kb-metro", similarity: 0.81, included: true },
        { id: "kb-duracao", similarity: 0.52, included: false },
        { id: "kb-pix", similarity: 0.31, included: false },
      ],
    })
  })

  it("não filtra pelo corte no SQL — senão os candidatos de fora nunca voltariam", async () => {
    h.pg.mockResolvedValue(rows)

    await searchWithEmbedding("agent-1", [0.1, 0.2], 5, 0.65)

    const sqlText = (h.pg.mock.calls[0][0] as string[]).join("?")
    expect(sqlText).not.toMatch(/>=/)
    expect(sqlText).toMatch(/ORDER BY embedding <=>/)
    expect(sqlText).toMatch(/LIMIT/)
  })

  it("erro de SQL vira reason 'erro_busca'", async () => {
    h.pg.mockRejectedValue(new Error("connection reset"))

    const result = await searchWithEmbedding("agent-1", [0.1], 5, 0.65)

    expect(result).toEqual({ error: "connection reset", reason: "erro_busca" })
  })
})

describe("findRelevantContext", () => {
  beforeEach(() => {
    h.pg.mockReset()
    h.embeddingsCreate.mockReset()
  })

  it("mensagem vazia vira reason 'sem_mensagem'", async () => {
    const result = await findRelevantContext("agent-1", "   ", 5, 0.65)
    expect(result).toMatchObject({ reason: "sem_mensagem" })
  })

  it("embedding que falha vira reason 'sem_embedding'", async () => {
    h.embeddingsCreate.mockRejectedValue(new Error("OpenAI 500"))

    const result = await findRelevantContext("agent-1", "qual os valores?", 5, 0.65, null)

    expect(result).toMatchObject({ reason: "sem_embedding" })
    expect(h.pg).not.toHaveBeenCalled()
  })
})

describe("resolveRagSettings", () => {
  it("sem env, usa 0,65 e 5", () => {
    expect(resolveRagSettings(undefined, undefined)).toEqual({ threshold: 0.65, limit: 5, invalid: [] })
  })

  it("aceita valores válidos", () => {
    expect(resolveRagSettings("0.5", "3")).toEqual({ threshold: 0.5, limit: 3, invalid: [] })
  })

  it("'0,6' (vírgula) não vira 0 — deixaria TUDO passar do corte", () => {
    const s = resolveRagSettings("0,6", undefined)
    expect(s.threshold).toBe(0.65)
    expect(s.invalid).toEqual(["RAG_SIMILARITY_THRESHOLD=0,6"])
  })

  it("'65' (porcentagem) não faz nada passar do corte", () => {
    expect(resolveRagSettings("65", undefined).threshold).toBe(0.65)
  })

  it("top-k inválido não vira LIMIT NaN", () => {
    for (const bad of ["abc", "0", "21", "2.5", ""]) {
      const s = resolveRagSettings(undefined, bad)
      expect(s.limit).toBe(5)
      expect(s.invalid).toEqual([`RAG_MAX_RESULTS=${bad}`])
    }
  })
})
