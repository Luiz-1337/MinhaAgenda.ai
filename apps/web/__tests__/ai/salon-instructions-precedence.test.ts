import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentInfo } from "@/lib/services/ai/agent-info.service"

// vi.hoisted: a fn precisa existir ANTES da fábrica vi.mock (que é içada).
const h = vi.hoisted(() => ({ findSalon: vi.fn() }))

vi.mock("@repo/db", () => ({
  db: {
    query: {
      salons: { findFirst: h.findSalon },
      agents: { findFirst: vi.fn() },
      agentKnowledgeBase: { findFirst: vi.fn() },
    },
  },
  salons: { id: "id" },
  agents: { salonId: "salonId", isActive: "isActive" },
  agentKnowledgeBase: { agentId: "agentId" },
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}))

import {
  createSalonAssistantPrompt,
  formatSalonInstructionsText,
} from "@/lib/services/ai/system-prompt-builder.service"

/**
 * O prompt que o dono escreve para o agente entrava cru no fim do system prompt,
 * sem nada dizendo que valia mais que as regras gerais que vêm antes dele. Em
 * 23/09/2026 a Liz (Spettacolo) passou preço cheio em vez de "a partir de" e
 * ofereceu a duração dos serviços — as duas coisas proibidas no prompt do dono.
 */

const SALON_HEADER = "INSTRUÇÕES DO SALÃO (escritas pelo dono do salão"
const LIZ_RULE = "Sempre que for passar o valor, sempre fale que é a partir de."

function agent(systemPrompt: string): AgentInfo {
  return {
    id: "agent-1",
    salonId: "salon-1",
    name: "Liz",
    systemPrompt,
    model: "gpt-6-sol",
    tone: "informal",
    whatsappNumber: null,
    isActive: true,
    hasKnowledgeBase: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }
}

function build(systemPrompt: string) {
  return createSalonAssistantPrompt("salon-1", undefined, undefined, "Cliente", "cust-1", false, agent(systemPrompt))
}

describe("instruções do salão no system prompt", () => {
  beforeEach(() => {
    h.findSalon.mockReset()
    h.findSalon.mockResolvedValue({ settings: {} })
  })

  it("entram no fim, sob um cabeçalho que as põe acima do estilo e do fluxo gerais", async () => {
    const prompt = await build(LIZ_RULE)
    const header = prompt.indexOf(SALON_HEADER)

    expect(header).toBeGreaterThan(prompt.indexOf("ESTILO DE COMUNICAÇÃO"))
    expect(header).toBeGreaterThan(prompt.indexOf("FLUXO DE AGENDAMENTO"))
    expect(prompt.slice(header)).toContain("valem MAIS que as regras gerais")
    expect(prompt.endsWith(LIZ_RULE)).toBe(true)
  })

  it("as travas de segurança continuam acima do salão", () => {
    const text = formatSalonInstructionsText(LIZ_RULE)

    expect(text).toContain("nunca inventar serviços, preços, profissionais, horários ou IDs")
    expect(text).toContain("checkAvailability antes de oferecer ou confirmar horário")
    expect(text).toContain("nunca mostrar IDs ao cliente")
  })

  it("manda corrigir o formato de respostas anteriores em vez de repeti-lo", () => {
    // Com a precedência no ar, o gpt-6-sol repetiu a lista de preço cheio que já
    // tinha dado na mesma conversa (23/09, 12:32).
    expect(formatSalonInstructionsText(LIZ_RULE)).toContain(
      "valem também sobre as SUAS respostas anteriores nesta conversa"
    )
  })

  it("deixa claro que 'a partir de' não é inventar preço", () => {
    const text = formatSalonInstructionsText(LIZ_RULE)
    expect(text).toContain('"a partir de R$ X", com o menor valor que a tool devolveu) NÃO é inventar preço')
    expect(text).toContain("use-o em TODA resposta com preço, inclusive em listas")
  })

  it("o Treinamento que o RAG trouxe entra DENTRO das instruções do salão, depois do prompt", async () => {
    // Antes entrava no meio dos blocos de dados, como "CONTEXTO DE REGRAS DO SALÃO",
    // com "se a pergunta estiver relacionada, priorize" — abaixo do estilo geral.
    const ITEM = "Nunca coloque quanto tempo dura cada procedimento, a não ser que a cliente pergunte."
    const prompt = await createSalonAssistantPrompt(
      "salon-1", undefined, ITEM, "Cliente", "cust-1", false, agent(LIZ_RULE)
    )
    const training = prompt.indexOf("TREINAMENTO DO SALÃO")

    expect(training).toBeGreaterThan(prompt.indexOf(SALON_HEADER))
    expect(training).toBeGreaterThan(prompt.indexOf(LIZ_RULE))
    expect(prompt.slice(training)).toContain("se algum contradisser as instruções acima, siga as instruções acima")
    expect(prompt.endsWith(ITEM)).toBe(true)
    expect(prompt).not.toContain("CONTEXTO DE REGRAS DO SALÃO")
  })

  it("salão só com Treinamento, sem prompt, também ganha o cabeçalho de prioridade", () => {
    const text = formatSalonInstructionsText("", "O salão possui estacionamento no local.")

    expect(text.startsWith(SALON_HEADER)).toBe(true)
    expect(text).toContain("TREINAMENTO DO SALÃO")
    expect(text.endsWith("O salão possui estacionamento no local.")).toBe(true)
  })

  it("o estilo geral avisa que o salão pode mudá-lo", async () => {
    const prompt = await build(LIZ_RULE)
    expect(prompt).toContain("ESTILO DE COMUNICAÇÃO (OBRIGATÓRIO, salvo quando as INSTRUÇÕES DO SALÃO")
  })

  it("salão sem instruções não ganha cabeçalho vazio", async () => {
    expect(formatSalonInstructionsText("")).toBe("")
    expect(formatSalonInstructionsText("   \n ")).toBe("")
    expect(formatSalonInstructionsText(null)).toBe("")
    expect(formatSalonInstructionsText(undefined)).toBe("")
    expect(await build("")).not.toContain(SALON_HEADER)
  })
})
