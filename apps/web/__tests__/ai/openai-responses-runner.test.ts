import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { z } from "zod"

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

/**
 * A OpenAI NÃO carrega `instructions` pelo previous_response_id. O runner mandava
 * o system prompt só no round 0, então toda resposta escrita depois de uma tool
 * saía sem ele: em 23/09/2026, numa conversa limpa, a Liz respondeu "quais os
 * valores?" com tabela Markdown, preço cheio e duração — contra o prompt do dono
 * E contra o "sem markdown" da própria plataforma.
 */
describe("runOpenAIResponses — o system prompt vai em todo round", () => {
  const INSTRUCTIONS = "REGRAS DO SALAO: preco sempre 'a partir de'"
  const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
  const functionCall = { type: "function_call", name: "getServices", call_id: "call_1", arguments: "{}" }
  const tools = {
    getServices: {
      description: "Lista os serviços do salão",
      inputSchema: z.object({}),
      execute: async () => [{ name: "Corte", priceFormatted: "R$ 290,00" }],
    },
  }

  function runWithTools(maxToolRounds?: number) {
    return runOpenAIResponses({
      model: "gpt-6-sol",
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content: "quais os valores?" }],
      tools,
      maxToolRounds,
    })
  }

  beforeEach(() => {
    h.create.mockReset()
  })

  it("reenvia as instructions na resposta escrita depois de uma tool", async () => {
    h.create
      .mockResolvedValueOnce({ id: "resp_1", output: [functionCall], usage })
      .mockResolvedValueOnce({ id: "resp_2", output_text: "Corte: a partir de R$ 290,00", output: [], usage })

    const result = await runWithTools()

    expect(result.text).toBe("Corte: a partir de R$ 290,00")
    expect(h.create).toHaveBeenCalledTimes(2)
    expect(h.create.mock.calls[0][0].instructions).toBe(INSTRUCTIONS)
    expect(h.create.mock.calls[1][0].previous_response_id).toBe("resp_1")
    expect(h.create.mock.calls[1][0].instructions).toBe(INSTRUCTIONS)
  })

  it("a chamada final, no teto de rounds, também leva as instructions", async () => {
    h.create
      .mockResolvedValueOnce({ id: "resp_1", output: [functionCall], usage })
      .mockResolvedValueOnce({ id: "resp_final", output_text: "Posso ajudar em algo mais?", output: [], usage })

    await runWithTools(1)

    const finalCall = h.create.mock.calls[1][0]
    expect(finalCall.tool_choice).toBe("none")
    expect(finalCall.instructions).toBe(INSTRUCTIONS)
  })
})
