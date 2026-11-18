import { describe, it, expect } from "vitest"
import {
  DOCUMENT_LIMITS,
  documentExpiry,
  documentHashInput,
  documentStatus,
  isDocumentToken,
  planDocumentSignature,
  planDocumentTemplate,
  renderDocument,
} from "@repo/db/src/domain/customer-documents"

/**
 * A regra dos documentos com assinatura, testada sem banco (docs/ROADMAP.md,
 * fase 7, fatia 7e).
 *
 * O que estes testes seguram: o modelo só aceita os campos que existem, o retrato
 * preenche os campos sem reler o que entrou, o link vence, assina-se uma vez só e
 * a imagem da assinatura só entra se for um PNG em data URL.
 */

// "iVBORw0KGgo" + enchimento: tem cara de PNG e o tamanho mínimo.
const PNG = `data:image/png;base64,iVBORw0KGgo${"A".repeat(700)}`

describe("planDocumentTemplate", () => {
  it("normaliza o nome e o texto, mantendo as quebras de linha", () => {
    expect(
      planDocumentTemplate({ name: "  Termo   de coloração ", body: "  Eu, {{cliente}},  \r\ndeclaro.\n\n\n\n\n{{ Data }}  " })
    ).toEqual({
      ok: true,
      template: { name: "Termo de coloração", body: "Eu, {{cliente}},\ndeclaro.\n\n\n{{ Data }}" },
    })
  })

  it("recusa modelo sem nome, sem texto ou grande demais", () => {
    const error = (draft: { name: unknown; body: unknown }) => {
      const plan = planDocumentTemplate(draft)
      return plan.ok ? null : plan.error
    }
    expect(error({ name: " ", body: "Texto" })).toBe("Dê um nome ao modelo")
    expect(error({ name: "x".repeat(81), body: "Texto" })).toBe("O nome do modelo tem até 80 caracteres")
    expect(error({ name: "Termo", body: " \n " })).toBe("Escreva o texto do documento")
    expect(error({ name: "Termo", body: null })).toBe("Escreva o texto do documento")
    expect(error({ name: "Termo", body: "x".repeat(DOCUMENT_LIMITS.body + 1) })).toBe(
      "O texto do documento tem até 20.000 caracteres"
    )
    expect(error({ name: "Termo", body: "x".repeat(DOCUMENT_LIMITS.body) })).toBeNull()
  })

  it("recusa campo que não existe, dizendo qual", () => {
    const plan = planDocumentTemplate({ name: "Termo", body: "CPF: {{cpf}}" })
    expect(plan).toEqual({
      ok: false,
      error: "O campo {{cpf}} não existe. Os campos são: {{cliente}}, {{salao}}, {{data}}",
    })
  })
})

describe("renderDocument", () => {
  const values = { cliente: "Maria  Teste", salao: "Salão Modelo", data: "18/11/2026" }

  it("preenche os campos, sem diferença de maiúscula nem de espaço", () => {
    expect(
      renderDocument({ name: "Termo", body: "Eu, {{cliente}}, autorizo o {{ SALAO }}.\n{{data}} — {{cliente}}" }, values)
    ).toEqual({
      ok: true,
      title: "Termo",
      body: "Eu, Maria Teste, autorizo o Salão Modelo.\n18/11/2026 — Maria Teste",
    })
  })

  it("o valor de um campo não é lido de novo como campo", () => {
    const rendered = renderDocument({ name: "Termo", body: "{{cliente}} / {{salao}}" }, { ...values, cliente: "{{salao}}" })
    expect(rendered.ok && rendered.body).toBe("{{salao}} / Salão Modelo")
  })

  it("recusa o retrato que passa do limite", () => {
    const body = `${"x".repeat(DOCUMENT_LIMITS.body - 11)}{{cliente}}`
    expect(renderDocument({ name: "Termo", body }, { ...values, cliente: "y".repeat(2000) }).ok).toBe(false)
    expect(renderDocument({ name: "Termo", body }, values).ok).toBe(true)
  })
})

describe("situação e link", () => {
  const created = new Date("2026-11-18T12:00:00Z")
  const expiresAt = documentExpiry(created)

  it("o link vale 30 dias", () => {
    expect(expiresAt.toISOString()).toBe("2026-12-18T12:00:00.000Z")
  })

  it("pendente até vencer; assinado ganha de vencido", () => {
    expect(documentStatus({ signedAt: null, expiresAt }, created)).toBe("pending")
    expect(documentStatus({ signedAt: null, expiresAt }, new Date(expiresAt.getTime() - 1))).toBe("pending")
    expect(documentStatus({ signedAt: null, expiresAt }, expiresAt)).toBe("expired")
    expect(documentStatus({ signedAt: created, expiresAt }, new Date("2027-06-01T00:00:00Z"))).toBe("signed")
  })

  it("token com cara de token", () => {
    expect(isDocumentToken("a".repeat(32))).toBe(true)
    expect(isDocumentToken("Ab_-".repeat(8))).toBe(true)
    expect(isDocumentToken("a".repeat(31))).toBe(false)
    expect(isDocumentToken("a".repeat(65))).toBe(false)
    expect(isDocumentToken(`${"a".repeat(31)}'`)).toBe(false)
    expect(isDocumentToken(null)).toBe(false)
  })

  it("o que entra no hash é título e texto, sempre do mesmo jeito", () => {
    expect(documentHashInput("Termo", "Texto")).toBe("Termo\n\nTexto")
  })
})

describe("planDocumentSignature", () => {
  const ok = { status: "pending" as const, signerName: "  Maria   Teste ", signatureImage: PNG, accepted: true }
  const error = (over: Partial<Record<keyof typeof ok, unknown>>) => {
    const plan = planDocumentSignature({ ...ok, ...over } as Parameters<typeof planDocumentSignature>[0])
    return plan.ok ? null : plan.error
  }

  it("aceita nome, PNG e o 'li e concordo'", () => {
    expect(planDocumentSignature(ok)).toEqual({ ok: true, signerName: "Maria Teste", signatureImage: PNG })
  })

  it("assina-se uma vez só, e só enquanto o link vale", () => {
    expect(error({ status: "signed" })).toBe("Este documento já foi assinado")
    expect(error({ status: "expired" })).toBe("Este link venceu. Peça um novo link ao salão")
  })

  it("pede o 'li e concordo' e o nome", () => {
    expect(error({ accepted: false })).toBe("Marque que você leu e concorda com o documento")
    expect(error({ accepted: "true" })).toBe("Marque que você leu e concorda com o documento")
    expect(error({ signerName: "Ma" })).toBe("Escreva o seu nome completo")
    expect(error({ signerName: null })).toBe("Escreva o seu nome completo")
    expect(error({ signerName: "x".repeat(121) })).toBe("O nome tem até 120 caracteres")
  })

  it("a imagem só entra se for PNG em data URL, do tamanho certo", () => {
    expect(error({ signatureImage: "" })).toBe("Desenhe a sua assinatura")
    expect(error({ signatureImage: null })).toBe("Desenhe a sua assinatura")
    expect(error({ signatureImage: `data:image/png;base64,${"A".repeat(200001)}` })).toBe(
      "A assinatura ficou grande demais. Limpe e assine de novo"
    )
    const invalid = "Assinatura inválida. Limpe e assine de novo"
    // SVG (pode levar script), outro esquema, base64 que não é PNG e lixo no fim.
    expect(error({ signatureImage: `data:image/svg+xml;base64,${"A".repeat(700)}` })).toBe(invalid)
    expect(error({ signatureImage: `https://exemplo.test/${"a".repeat(700)}.png` })).toBe(invalid)
    expect(error({ signatureImage: `data:image/png;base64,${"A".repeat(700)}` })).toBe(invalid)
    expect(error({ signatureImage: `${PNG}" onerror="x` })).toBe(invalid)
  })
})
