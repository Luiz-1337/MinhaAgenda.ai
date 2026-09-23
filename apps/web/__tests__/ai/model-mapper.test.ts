import { describe, it, expect } from "vitest"
import { mapModelToOpenAI } from "@/lib/services/ai/model-mapper.service"
import { AI_MODEL_CONSTANTS } from "@/lib/constants/ai.constants"

/**
 * Os agentes de produção ainda têm `agents.model` legado — em 23/09/2026:
 * 6 com `gpt-5-mini` e 3 com `gpt-5.4-mini-2026-03-17`. A troca de modelo tem
 * que valer para eles sem depender de migrar a coluna.
 */

const CURRENT = AI_MODEL_CONSTANTS.DEFAULT_MODEL

describe("mapModelToOpenAI", () => {
  it("o modelo da plataforma é o gpt-6-sol, com esse nome exato", () => {
    expect(CURRENT).toBe("gpt-6-sol")
    expect(mapModelToOpenAI("gpt-6-sol")).toBe("gpt-6-sol")
  })

  it("rótulos legados gravados em agents.model rodam no modelo atual", () => {
    expect(mapModelToOpenAI("gpt-5.4-mini-2026-03-17")).toBe(CURRENT)
    expect(mapModelToOpenAI("gpt-5-mini")).toBe(CURRENT)
  })

  it("vazio, null e undefined caem no modelo atual", () => {
    expect(mapModelToOpenAI("")).toBe(CURRENT)
    expect(mapModelToOpenAI(null)).toBe(CURRENT)
    expect(mapModelToOpenAI(undefined)).toBe(CURRENT)
  })
})
