import { describe, it, expect } from "vitest"
import { hasFeature, tiersWithFeature } from "@/lib/services/plan-features.service"

/**
 * Gate de feature por plano. O que importa aqui é o comportamento de BORDA:
 * um gate que devolve `true` por acidente entrega feature paga de graça, e um que
 * devolve `true` para tier ausente é a mesma coisa com outro nome.
 */
describe("hasFeature", () => {
  it("relatorios avancados: PRO e ENTERPRISE sim, SOLO nao", () => {
    expect(hasFeature("PRO", "advanced_reports")).toBe(true)
    expect(hasFeature("ENTERPRISE", "advanced_reports")).toBe(true)
    expect(hasFeature("SOLO", "advanced_reports")).toBe(false)
  })

  it("tier ausente NEGA — nunca libera por omissao", () => {
    // getSalonTier devolve null quando o salao nao existe ou o join falha. Se isso
    // virasse `true`, um salonId invalido daria acesso a feature paga.
    expect(hasFeature(null, "advanced_reports")).toBe(false)
    expect(hasFeature(undefined, "advanced_reports")).toBe(false)
  })

  it("tier desconhecido NEGA", () => {
    // salon-plan.service.ts declara um tier fantasma 'TEAM' que nao existe no enum.
    // Se ele vazar para ca, tem que ser negado, nao liberado.
    expect(hasFeature("TEAM" as never, "advanced_reports")).toBe(false)
    expect(hasFeature("" as never, "advanced_reports")).toBe(false)
  })

  it("tiersWithFeature diz QUAL plano assinar (a tela de upgrade usa isso)", () => {
    expect(tiersWithFeature("advanced_reports")).toEqual(["PRO", "ENTERPRISE"])
  })
})
