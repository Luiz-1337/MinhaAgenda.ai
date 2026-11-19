/**
 * Limite das instruções do agente no painel (agentSchema, usado pelo formulário do
 * agente e por createAgent/updateAgent).
 *
 * Em 19/nov/2026 o prompt da Judite passou de 10.000 caracteres (o limite de então):
 * em produção ele roda normalmente — o banco e a IA não limitam —, mas o formulário do
 * agente recusava salvar qualquer coisa. O teste com o prompt versionado da Judite avisa
 * antes de ele crescer além do limite de novo.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { updateAgentSchema } from "@/lib/schemas"

/** Como vai para `agents.system_prompt` (mesma normalização de loadJuditePrompt, no eval da Judite). */
function juditePrompt(): string {
  const file = path.resolve(__dirname, "../eval/judite/system-prompt.txt")
  return readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim()
}

describe("agentSchema — instruções do agente", () => {
  it("aceita o prompt da Judite que está em produção", () => {
    const result = updateAgentSchema.safeParse({ systemPrompt: juditePrompt() })
    expect(result.success).toBe(true)
  })

  it("aceita até 15.000 caracteres e recusa a partir de 15.001", () => {
    expect(updateAgentSchema.safeParse({ systemPrompt: "a".repeat(15_000) }).success).toBe(true)

    const tooLong = updateAgentSchema.safeParse({ systemPrompt: "a".repeat(15_001) })
    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues[0]?.message).toBe("System prompt muito longo (máximo de 15.000 caracteres)")
  })

  it("continua exigindo instruções", () => {
    expect(updateAgentSchema.safeParse({ systemPrompt: "" }).success).toBe(false)
  })
})
