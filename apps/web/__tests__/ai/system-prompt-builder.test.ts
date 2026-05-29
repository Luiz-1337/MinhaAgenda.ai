import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentInfo } from "@/lib/services/ai/agent-info.service";

const findSalonMock = vi.fn();

vi.mock("@repo/db", () => ({
  db: {
    query: {
      salons: { findFirst: findSalonMock },
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
}));

describe("system-prompt-builder", () => {
  beforeEach(() => {
    findSalonMock.mockReset();
    findSalonMock.mockResolvedValue({ settings: {} });
  });

  it("inclui regra explícita de agenda interna sempre disponível", async () => {
    const { createSalonAssistantPrompt } = await import(
      "@/lib/services/ai/system-prompt-builder.service"
    );

    const agentInfo: AgentInfo = {
      id: "agent-1",
      salonId: "salon-1",
      name: "Assistente",
      systemPrompt: "",
      model: "gpt-5.4-mini-2026-03-17",
      tone: "profissional",
      whatsappNumber: null,
      isActive: true,
      hasKnowledgeBase: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const prompt = await createSalonAssistantPrompt(
      "salon-1",
      undefined,
      undefined,
      "Cliente",
      "cust-1",
      false,
      agentInfo
    );

    expect(prompt).toContain("A agenda SEMPRE existe. NUNCA diga que está inacessível.");
  });

  it("injeta âncora de data em ISO e instrui conversão para ISO 8601 nas tools", async () => {
    const { createSalonAssistantPrompt } = await import(
      "@/lib/services/ai/system-prompt-builder.service"
    );

    const agentInfo: AgentInfo = {
      id: "agent-1",
      salonId: "salon-1",
      name: "Assistente",
      systemPrompt: "",
      model: "gpt-5.4-mini-2026-03-17",
      tone: "profissional",
      whatsappNumber: null,
      isActive: true,
      hasKnowledgeBase: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };

    const prompt = await createSalonAssistantPrompt(
      "salon-1",
      undefined,
      undefined,
      "Cliente",
      "cust-1",
      false,
      agentInfo
    );

    // Âncora ISO de hoje (YYYY-MM-DD no fuso de Brasília) deve estar presente.
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(prompt).toContain(`Hoje em ISO: ${todayIso}`);

    // Instrução explícita de converter para ISO 8601 antes de chamar tools.
    expect(prompt).toContain("ISO 8601 completo");
    expect(prompt).toContain("AAAA-MM-DDTHH:MM:SS-03:00");
  });
});
