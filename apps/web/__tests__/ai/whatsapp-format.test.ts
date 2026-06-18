import { describe, it, expect } from "vitest"
import { normalizeWhatsappFormatting } from "@/lib/services/ai/whatsapp-format"

describe("normalizeWhatsappFormatting", () => {
  it("converte **negrito** do Markdown para *negrito* do WhatsApp", () => {
    expect(normalizeWhatsappFormatting("o valor é **R$ 50**")).toBe("o valor é *R$ 50*")
  })

  it("colapsa múltiplos asteriscos (***x*** -> *x*)", () => {
    expect(normalizeWhatsappFormatting("***importante***")).toBe("*importante*")
  })

  it("trata mais de um negrito na mesma linha", () => {
    expect(normalizeWhatsappFormatting("**Corte** custa **R$ 50**")).toBe("*Corte* custa *R$ 50*")
  })

  it("remove marcadores de heading markdown", () => {
    expect(normalizeWhatsappFormatting("### Título\ntexto")).toBe("Título\ntexto")
  })

  it("não altera texto sem markdown", () => {
    expect(normalizeWhatsappFormatting("oi, tudo bem?")).toBe("oi, tudo bem?")
  })

  it("preserva *negrito* já no formato WhatsApp", () => {
    expect(normalizeWhatsappFormatting("já *certo*")).toBe("já *certo*")
  })
})
