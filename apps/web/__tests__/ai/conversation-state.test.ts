import { describe, expect, it } from "vitest"
import type { ResponsesRunnerInputMessage } from "@/lib/services/ai/openai-responses-runner.service"
import {
  detectExecutedTools,
  formatConversationStateText,
  detectAppointmentIntent,
  detectFlowViolation,
} from "@/lib/services/ai/conversation-state"

function assistantWithToolCtx(toolLines: string[]): ResponsesRunnerInputMessage {
  return {
    role: "assistant",
    content: `Resposta\n\n---TOOL_CONTEXT---\n${toolLines.join("\n")}\n---END_TOOL_CONTEXT---`,
  }
}

describe("detectExecutedTools", () => {
  it("extrai nomes de tools de blocos ---TOOL_CONTEXT---", () => {
    const history: ResponsesRunnerInputMessage[] = [
      { role: "user", content: "oi" },
      assistantWithToolCtx([
        "[getServices]({}) -> Corte(id:abc,R$50,30min)",
        "[checkAvailability]({\"date\":\"...\"}) -> horarios: 09:00,10:00",
      ]),
    ]

    const out = detectExecutedTools(history)
    expect(out.has("getServices")).toBe(true)
    expect(out.has("checkAvailability")).toBe(true)
  })

  it("ignora mensagens user e mensagens assistant sem TOOL_CONTEXT", () => {
    const history: ResponsesRunnerInputMessage[] = [
      { role: "user", content: "[getServices](x)" }, // mesmo se user escrever isso, ignora
      { role: "assistant", content: "Olá! Como posso ajudar?" },
    ]

    const out = detectExecutedTools(history)
    expect(out.size).toBe(0)
  })

  it("acumula tools de multiplos blocos em mensagens diferentes", () => {
    const history: ResponsesRunnerInputMessage[] = [
      assistantWithToolCtx(["[getServices]({}) -> ..."]),
      { role: "user", content: "ok" },
      assistantWithToolCtx(["[getProfessionals]({}) -> ..."]),
    ]

    const out = detectExecutedTools(history)
    expect(out.has("getServices")).toBe(true)
    expect(out.has("getProfessionals")).toBe(true)
  })

  it("nao casa markdown link comum fora de TOOL_CONTEXT", () => {
    const history: ResponsesRunnerInputMessage[] = [
      { role: "assistant", content: "Veja [getServices](https://docs.exemplo)" },
    ]

    const out = detectExecutedTools(history)
    expect(out.size).toBe(0)
  })
})

describe("formatConversationStateText", () => {
  it("retorna string vazia quando todas as tools de interesse foram chamadas", () => {
    const executed = new Set(["getServices", "getProfessionals", "getMyFutureAppointments"])
    expect(formatConversationStateText(executed)).toBe("")
  })

  it("lista NAO chamada para tools faltantes", () => {
    const executed = new Set(["getServices"])
    const out = formatConversationStateText(executed)
    expect(out).toContain("ESTADO DA CONVERSA")
    expect(out).toContain("getServices: chamada nesta conversa")
    expect(out).toContain("getProfessionals: NAO chamada")
    expect(out).toContain("getMyFutureAppointments: NAO chamada")
  })

  it("inclui instrucao explicita de chamar tools de leitura antes de mutacao", () => {
    const out = formatConversationStateText(new Set<string>())
    expect(out).toContain("addAppointment")
    expect(out).toContain("NUNCA invente IDs")
  })
})

describe("detectAppointmentIntent", () => {
  it.each([
    "quero agendar corte amanhã",
    "marca pra mim às 10h",
    "tem horário sábado?",
    "preciso reservar",
    "quero reagendar meu horário",
    "cancela meu agendamento",
    "remarcar pra outro dia",
  ])("detecta intent em: %s", (msg) => {
    expect(detectAppointmentIntent(msg)).toBe(true)
  })

  it.each([
    "oi",
    "obrigado",
    "tchau",
    "Marcos passou aqui",
    "que horas vocês abrem?", // "horas" nao casa "horári"
    "ola, tudo bem?",
  ])("nao detecta intent em: %s", (msg) => {
    expect(detectAppointmentIntent(msg)).toBe(false)
  })
})

describe("detectFlowViolation", () => {
  it("retorna true quando addAppointment foi chamado sem getServices no turno e nem em historico", () => {
    const violation = detectFlowViolation(["addAppointment"], new Set())
    expect(violation).toBe(true)
  })

  it("retorna false quando getServices ja foi chamada no MESMO turno antes", () => {
    const violation = detectFlowViolation(
      ["getServices", "checkAvailability", "addAppointment"],
      new Set()
    )
    expect(violation).toBe(false)
  })

  it("retorna false quando getServices ja foi chamada em turno anterior", () => {
    const violation = detectFlowViolation(["addAppointment"], new Set(["getServices"]))
    expect(violation).toBe(false)
  })

  it("retorna false quando nenhuma tool de mutacao foi chamada", () => {
    const violation = detectFlowViolation(["getServices", "checkAvailability"], new Set())
    expect(violation).toBe(false)
  })

  it("retorna true tambem para updateAppointment sem getServices", () => {
    const violation = detectFlowViolation(["updateAppointment"], new Set())
    expect(violation).toBe(true)
  })
})
