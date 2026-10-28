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
  formatSalonSettingsText,
} from "@/lib/services/ai/system-prompt-builder.service"

/**
 * As chaves "Aceita Cartão" e "Estacionamento" das Configurações do Salão eram
 * gravadas e nunca chegavam à IA. Agora entram no bloco CONFIGURAÇÕES DO SALÃO,
 * mas só quando estão ligadas: o formulário e o onboarding gravam `false` por
 * padrão, e em 28/10/2026 o Salão TOP tinha estacionamento `false` com um item
 * do Treinamento mandando dizer que tem.
 */

const CARD = "- Aceita cartão de crédito e débito."
const PARKING = "- Tem estacionamento próprio."

const agent: AgentInfo = {
  id: "agent-1",
  salonId: "salon-1",
  name: "Liz",
  systemPrompt: "",
  model: "gpt-6-sol",
  tone: "informal",
  whatsappNumber: null,
  isActive: true,
  hasKnowledgeBase: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

function build(settings: Record<string, unknown>) {
  h.findSalon.mockResolvedValue({ settings })
  return createSalonAssistantPrompt("salon-1", undefined, undefined, "Cliente", "cust-1", false, agent)
}

describe("configurações do salão no system prompt", () => {
  beforeEach(() => {
    h.findSalon.mockReset()
  })

  it("cartão e estacionamento ligados chegam à IA", async () => {
    const prompt = await build({ accepts_card: true, parking: true, late_tolerance_minutes: 10 })

    expect(prompt).toContain(
      `CONFIGURAÇÕES DO SALÃO:\n- Tolerância para atrasos: 10 minutos\n${CARD}\n${PARKING}`
    )
  })

  it("chave desligada não vira um 'não' para o cliente", () => {
    // false é o padrão do formulário: não diz se o salão não tem ou se o dono nunca mexeu.
    expect(formatSalonSettingsText({ accepts_card: false, parking: false })).toBe("")
    expect(formatSalonSettingsText({ late_tolerance_minutes: 15, accepts_card: false, parking: false })).toBe(
      "\n\nCONFIGURAÇÕES DO SALÃO:\n- Tolerância para atrasos: 15 minutos"
    )
  })

  it("cada chave entra sozinha", () => {
    expect(formatSalonSettingsText({ accepts_card: true })).toBe(`\n\nCONFIGURAÇÕES DO SALÃO:\n${CARD}`)
    expect(formatSalonSettingsText({ parking: true })).toBe(`\n\nCONFIGURAÇÕES DO SALÃO:\n${PARKING}`)
  })

  it("tolerância zero continua aparecendo", () => {
    expect(formatSalonSettingsText({ late_tolerance_minutes: 0 })).toBe(
      "\n\nCONFIGURAÇÕES DO SALÃO:\n- Tolerância para atrasos: 0 minutos"
    )
  })

  it("salão sem nenhuma dessas configurações não ganha bloco vazio", async () => {
    expect(formatSalonSettingsText({})).toBe("")
    expect(await build({})).not.toContain("CONFIGURAÇÕES DO SALÃO")
  })
})
