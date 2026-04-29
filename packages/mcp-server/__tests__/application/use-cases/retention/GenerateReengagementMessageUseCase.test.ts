import { describe, it, expect, vi, beforeEach } from "vitest"
import { GenerateReengagementMessageUseCase } from "../../../../src/application/use-cases/retention/GenerateReengagementMessageUseCase"
import type { IAiResponsesRunner } from "../../../../src/domain/services/IAiResponsesRunner"
import { IDS } from "../../../helpers/fixtures"

function mockAiRunner(): IAiResponsesRunner {
  return {
    runJson: vi.fn(),
  }
}

const baseInput = {
  salonId: IDS.salonId,
  salonName: "Salao Teste",
  agentTone: "Amigavel e descontraido",
  customerName: "Maria Aparecida",
  lastServiceName: "Progressiva",
  lastProfessionalName: "Joao",
  daysSinceVisit: 90,
  includeCoupon: false,
  model: "gpt-4o-mini",
}

describe("GenerateReengagementMessageUseCase", () => {
  let runner: IAiResponsesRunner
  let useCase: GenerateReengagementMessageUseCase

  beforeEach(() => {
    runner = mockAiRunner()
    useCase = new GenerateReengagementMessageUseCase(runner)
  })

  it("retorna a mensagem gerada e trim aplicado", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "  Oi Maria! Faz tempo, que tal voltar para uma nova progressiva? Responda PARAR para sair.  " },
      modelUsed: "gpt-4o-mini-2024-07-18",
      tokensUsed: 80,
      inputTokens: 50,
      outputTokens: 30,
      rawText: "{}",
    })

    const result = await useCase.execute(baseInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message.startsWith("Oi Maria")).toBe(true)
      expect(result.data.message.endsWith(".")).toBe(true)
      expect(result.data.tokensUsed).toBe(80)
      expect(result.data.modelUsed).toBe("gpt-4o-mini-2024-07-18")
    }
  })

  it("falha quando customerName vazio", async () => {
    const result = await useCase.execute({ ...baseInput, customerName: "" })
    expect(result.success).toBe(false)
  })

  it("propaga falha do runner como Result.fail", async () => {
    ;(runner.runJson as any).mockRejectedValue(new Error("zod validation failed"))
    const result = await useCase.execute(baseInput)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe("AI_GENERATION_FAILED")
    }
  })

  it("inclui o nome do servico e o tom no system prompt", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Que tal voltar para a progressiva? Responda PARAR." },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute(baseInput)

    expect(runner.runJson).toHaveBeenCalledTimes(1)
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("Salao Teste")
    expect(call.systemPrompt).toContain("Amigavel e descontraido")
    expect(call.userPrompt).toContain("Maria")
    expect(call.userPrompt).toContain("Progressiva")
    expect(call.userPrompt).toContain("90")
  })

  it("instrui a NAO mencionar desconto quando includeCoupon=false", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Faz tempo, que tal voltar? Responda PARAR para sair." },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute({ ...baseInput, includeCoupon: false })
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("NAO mencione descontos")
  })

  it("permite oferta sutil quando includeCoupon=true", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Tem horario aberto essa semana, vamos? Responda PARAR para sair." },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute({ ...baseInput, includeCoupon: true })
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("horario aberto ou uma condicao especial")
  })

  it("usa toneOverride quando fornecido", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Faz tempo, voce volta? Responda PARAR para sair." },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute({ ...baseInput, toneOverride: "Sofisticado e elegante" })
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("Sofisticado e elegante")
    expect(call.systemPrompt).not.toContain("Amigavel e descontraido")
  })

  it("inclui rodape de opt-out quando skipOptOutFooter=false (default)", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Faz tempo. Se preferir nao receber, e so responder PARAR." },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute({ ...baseInput })
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("Inclua sempre um opt-out natural")
    expect(call.systemPrompt).not.toContain("NAO inclua nenhum aviso")
  })

  it("instrui a OMITIR rodape de opt-out quando skipOptOutFooter=true", async () => {
    ;(runner.runJson as any).mockResolvedValue({
      output: { mensagem: "Oi Maria! Senti sua falta, vamos remarcar a progressiva?" },
      modelUsed: "gpt-4o-mini",
      tokensUsed: 50,
      inputTokens: 30,
      outputTokens: 20,
      rawText: "{}",
    })
    await useCase.execute({ ...baseInput, skipOptOutFooter: true })
    const call = (runner.runJson as any).mock.calls[0][0]
    expect(call.systemPrompt).toContain("NAO inclua nenhum aviso de opt-out")
    expect(call.systemPrompt).toContain("sem qualquer pista de automacao")
    expect(call.systemPrompt).not.toContain("Inclua sempre um opt-out natural")
  })
})
