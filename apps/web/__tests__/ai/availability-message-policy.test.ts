import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE,
  enforceAgendaAvailabilityPolicy,
  resolveFriendlyAvailabilityErrorMessage,
} from "@/lib/services/ai/availability-message-policy";

describe("availability-message-policy", () => {
  it("retorna null para erro técnico de checkAvailability", () => {
    const message = resolveFriendlyAvailabilityErrorMessage([
      { toolName: "checkAvailability", error: "TypeError: fetch failed" },
    ]);

    expect(message).toBeNull();
  });

  it("reaproveita mensagem amigável de negócio da tool", () => {
    const message = resolveFriendlyAvailabilityErrorMessage([
      {
        toolName: "checkAvailability",
        error: "Não há horários disponíveis nesta data. Posso sugerir outro período?",
      },
    ]);

    expect(message).toBe("Não há horários disponíveis nesta data. Posso sugerir outro período?");
  });

  it("não reaproveita mensagem que sugere agenda indisponível", () => {
    const message = resolveFriendlyAvailabilityErrorMessage([
      {
        toolName: "checkAvailability",
        error: "Poxa, não consegui acessar a agenda agora.",
      },
    ]);

    expect(message).toBeNull();
  });

  it("reescreve resposta final com semântica proibida de agenda indisponível", () => {
    const rewritten = enforceAgendaAvailabilityPolicy(
      "Poxa, não consegui usar a agenda agora, tenta mais tarde."
    );

    expect(rewritten).toBe(AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE);
  });

  it("mantém resposta quando não há semântica proibida", () => {
    const text = "Não encontrei horários nessa data. Posso sugerir amanhã?";
    const rewritten = enforceAgendaAvailabilityPolicy(text);

    expect(rewritten).toBe(text);
  });
});

