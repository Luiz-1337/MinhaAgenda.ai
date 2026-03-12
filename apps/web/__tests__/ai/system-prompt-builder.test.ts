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
      model: "gpt-5-mini",
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

    expect(prompt).toContain("A agenda interna do sistema SEMPRE existe e é a fonte de verdade.");
    expect(prompt).toContain("NUNCA diga que a agenda está inacessível, indisponível, fora do ar");
  });
});
