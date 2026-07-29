import { describe, it, expect, afterEach } from "vitest"
import { isEvolutionEnabled } from "@/lib/services/evolution/evolution-enabled"

/**
 * O valor que importa aqui é o DEFAULT. O serviço Evolution no Railway foi
 * apagado e a plataforma opera só com a Cloud API; se um deploy futuro fizer o
 * default voltar a ser "ligado", o painel volta a chamar um host morto a cada
 * visita e a rota de disconnect volta a gravar whatsapp_status='failed' em todos
 * os agentes do salão. Este teste é a trava dessa decisão.
 */
describe("isEvolutionEnabled", () => {
  const original = process.env.EVOLUTION_ENABLED

  afterEach(() => {
    if (original === undefined) delete process.env.EVOLUTION_ENABLED
    else process.env.EVOLUTION_ENABLED = original
  })

  it("é DESLIGADO quando a env não está definida", () => {
    delete process.env.EVOLUTION_ENABLED
    expect(isEvolutionEnabled()).toBe(false)
  })

  it("liga apenas com a string exata 'true'", () => {
    process.env.EVOLUTION_ENABLED = "true"
    expect(isEvolutionEnabled()).toBe(true)
  })

  it.each(["false", "1", "TRUE", "yes", "", " true "])(
    "permanece desligado para %o",
    (value) => {
      process.env.EVOLUTION_ENABLED = value
      expect(isEvolutionEnabled()).toBe(false)
    },
  )
})
