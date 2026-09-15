/**
 * O resumo compacto de tools (bloco ---TOOL_CONTEXT---) é PERSISTIDO junto da
 * mensagem do assistant e, nas mensagens seguintes da conversa, vira a única
 * coisa que a IA enxerga sobre o catálogo — ela não chama getServices de novo.
 *
 * Por isso este resumo não pode ler `price` cru: serviço de preço por FAIXA e
 * serviço "sob avaliação" gravam `price = 0` de propósito (o valor real mora em
 * price_min/price_max). Em 13/09/2026 isso fez a IA dizer a um cliente real que
 * "Coloração (Raiz + Tonalização)" custava R$ 0,00 — ela custa R$ 220 a R$ 300.
 */

import { describe, it, expect } from "vitest"
import { summarizeToolResult } from "@/lib/services/ai/generate-response.service"

/** Formato que o CatalogPresenter.servicesToJSON devolve para a tool getServices. */
function servicesResult(services: Record<string, unknown>[]) {
  return { services, total: services.length, message: `${services.length} serviço(s) encontrado(s)` }
}

describe("summarizeToolResult / getServices", () => {
  it("usa o preço formatado do serviço de preço fixo", () => {
    const summary = summarizeToolResult(
      "getServices",
      servicesResult([
        {
          id: "1ec02006",
          name: "Alinhamento e Botox",
          price: 550,
          priceFormatted: "R$ 550,00",
          duration: 90,
        },
      ])
    )

    expect(summary).toBe("Alinhamento e Botox(id:1ec02006,R$ 550,00,90min)")
  })

  it("preserva a FAIXA em vez de achatar para R$0", () => {
    const summary = summarizeToolResult(
      "getServices",
      servicesResult([
        {
          id: "cf424cc2",
          name: "Coloração (Raiz + Tonalização)",
          // Faixa: a coluna `price` é 0 por construção; o valor vive no formatado.
          price: 0,
          priceFormatted: "R$ 220,00 - R$ 300,00",
          duration: 120,
        },
      ])
    )

    expect(summary).toContain("R$ 220,00 - R$ 300,00")
    expect(summary).not.toContain("R$0")
  })

  it("preserva 'Sob avaliação' em vez de achatar para R$0", () => {
    const summary = summarizeToolResult(
      "getServices",
      servicesResult([
        {
          id: "bdd6e344",
          name: "Coloração Cabelo Todo",
          price: 0,
          priceFormatted: "Sob avaliação",
          precoSobAvaliacao: true,
          duration: 120,
        },
      ])
    )

    expect(summary).toContain("Sob avaliação")
    expect(summary).not.toContain("R$0")
  })

  it("cai para o preço cru quando não há formatado", () => {
    const summary = summarizeToolResult(
      "getServices",
      servicesResult([{ id: "abc", name: "Escova", price: 120, duration: 30 }])
    )

    expect(summary).toBe("Escova(id:abc,R$120,30min)")
  })
})
