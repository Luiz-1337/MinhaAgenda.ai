import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// vi.hoisted: a fn precisa existir ANTES da fábrica vi.mock (que é içada).
const h = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@/lib/services/ai/openai-client", () => ({
  getOpenAIClient: () => ({ responses: { create: h.create } }),
}))

import { runOpenAIResponses } from "@/lib/services/ai/openai-responses-runner.service"

/**
 * Um parâmetro que o modelo não aceita não falha uma mensagem: falha TODAS, e o
 * bot cala para todos os salões. Estes testes travam o que vai para o gpt-6-sol.
 */

function run(model: string) {
  return runOpenAIResponses({
    model,
    instructions: "sys",
    input: [{ role: "user", content: "oi" }],
    tools: {},
  })
}

function sentParams(): Record<string, unknown> {
  return h.create.mock.calls[0][0]
}

describe("runOpenAIResponses — parâmetros enviados ao gpt-6-sol", () => {
  const originalEffort = process.env.AI_REASONING_EFFORT

  beforeEach(() => {
    h.create.mockReset()
    h.create.mockResolvedValue({
      id: "resp_1",
      output_text: "Olá!",
      output: [],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    })
    delete process.env.AI_REASONING_EFFORT
  })

  afterEach(() => {
    if (originalEffort === undefined) delete process.env.AI_REASONING_EFFORT
    else process.env.AI_REASONING_EFFORT = originalEffort
  })

  it("manda reasoning.effort medium e nenhum temperature/top_p", async () => {
    const result = await run("gpt-6-sol")

    expect(result.text).toBe("Olá!")
    expect(sentParams().model).toBe("gpt-6-sol")
    expect(sentParams().reasoning).toEqual({ effort: "medium" })
    expect(sentParams()).not.toHaveProperty("temperature")
    expect(sentParams()).not.toHaveProperty("top_p")
  })

  it("AI_REASONING_EFFORT=minimal (só existia no gpt-5) cai em medium em vez de derrubar o bot", async () => {
    process.env.AI_REASONING_EFFORT = "minimal"
    await run("gpt-6-sol")
    expect(sentParams().reasoning).toEqual({ effort: "medium" })
  })

  it("um valor que o gpt-6-sol aceita passa direto", async () => {
    process.env.AI_REASONING_EFFORT = "high"
    await run("gpt-6-sol")
    expect(sentParams().reasoning).toEqual({ effort: "high" })
  })
})
