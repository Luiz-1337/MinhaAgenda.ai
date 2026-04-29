import { describe, it, expect } from "vitest"
import {
  parseReengagementMessage,
  parseRetentionSentiment,
} from "../../../../src/application/use-cases/retention/schemas/reengagement-message.schema"

describe("ReengagementMessageSchema", () => {
  it("aceita mensagem dentro do range de tamanho", () => {
    const out = parseReengagementMessage({ mensagem: "Oi Maria, faz tempo, vamos voltar?" })
    expect(out.mensagem).toBe("Oi Maria, faz tempo, vamos voltar?")
  })

  it("rejeita mensagem muito curta", () => {
    expect(() => parseReengagementMessage({ mensagem: "Oi" })).toThrow()
  })

  it("rejeita mensagem maior que 220 chars", () => {
    expect(() => parseReengagementMessage({ mensagem: "x".repeat(221) })).toThrow()
  })

  it("rejeita objetos sem 'mensagem'", () => {
    expect(() => parseReengagementMessage({ texto: "x".repeat(50) })).toThrow()
  })
})

describe("RetentionSentimentSchema", () => {
  it("aceita label e confidence valida", () => {
    const out = parseRetentionSentiment({ label: "annoyed", confidence: 0.9 })
    expect(out.label).toBe("annoyed")
    expect(out.confidence).toBe(0.9)
  })

  it("rejeita label desconhecida", () => {
    expect(() => parseRetentionSentiment({ label: "happy", confidence: 0.5 })).toThrow()
  })

  it("rejeita confidence fora de [0,1]", () => {
    expect(() => parseRetentionSentiment({ label: "neutral", confidence: 1.5 })).toThrow()
    expect(() => parseRetentionSentiment({ label: "neutral", confidence: -0.1 })).toThrow()
  })
})
