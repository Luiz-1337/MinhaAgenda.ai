/**
 * Quando uma tool falha, `handleToolErrors` troca a resposta da IA por um texto
 * pronto. Em 03/nov/2026 (Spettacolo Salone) a agenda oficial do salão não
 * carregou, addAppointment falhou com EXTERNAL_AGENDA_UNAVAILABLE e o cliente
 * recebeu "tive dificuldade ao tentar agendar. Pode me informar novamente a data
 * e horário desejados?" — pedindo dados que estavam certos.
 *
 * Os erros da agenda oficial já dizem à IA o que responder (ErrorPresenter do
 * mcp-server), então para eles a resposta da IA segue para o cliente.
 */

import { describe, it, expect, vi } from "vitest"
import { handleToolErrors } from "@/lib/services/ai/generate-response.service"

const logger = { warn: vi.fn() }

/** O formato que o ErrorPresenter.toJSON devolve quando uma tool falha. */
function toolError(code: string) {
  return { error: true, code, message: `mensagem de ${code}`, details: "detalhe" }
}

function step(...results: Array<{ toolName: string; result: unknown }>) {
  return { toolResults: results.map((r) => ({ ...r, isError: false })) }
}

const AGENDA_CODES = [
  "EXTERNAL_AGENDA_CONFLICT",
  "EXTERNAL_AGENDA_UNAVAILABLE",
  "EXTERNAL_AGENDA_NOT_LINKED",
  "EXTERNAL_AGENDA_REJECTED",
]

describe("handleToolErrors / agenda oficial", () => {
  it.each(AGENDA_CODES)("não troca a resposta da IA quando addAppointment falha com %s", (code) => {
    const steps = [step({ toolName: "addAppointment", result: toolError(code) })]

    expect(handleToolErrors(steps, logger)).toBeNull()
  })

  it.each(AGENDA_CODES)("não troca a resposta da IA quando updateAppointment falha com %s", (code) => {
    const steps = [step({ toolName: "updateAppointment", result: toolError(code) })]

    expect(handleToolErrors(steps, logger)).toBeNull()
  })

  it("deixa a resposta da IA quando ela já buscou outros horários depois do conflito", () => {
    const steps = [
      step({ toolName: "addAppointment", result: toolError("EXTERNAL_AGENDA_CONFLICT") }),
      step({ toolName: "checkAvailability", result: { slots: [] } }),
    ]

    expect(handleToolErrors(steps, logger)).toBeNull()
  })
})

describe("handleToolErrors / demais erros (sem mudança)", () => {
  it("addAppointment com falha comum ainda usa o texto pronto", () => {
    const steps = [step({ toolName: "addAppointment", result: toolError("APPOINTMENT_CREATION_FAILED") })]

    expect(handleToolErrors(steps, logger)).toContain("tive dificuldade ao tentar agendar")
  })

  it("um erro de agenda oficial não esconde outra tool que falhou de verdade", () => {
    const steps = [
      step(
        { toolName: "addAppointment", result: toolError("EXTERNAL_AGENDA_UNAVAILABLE") },
        { toolName: "getServices", result: toolError("UNKNOWN_ERROR") }
      ),
    ]

    expect(handleToolErrors(steps, logger)).toContain("não consegui carregar nossos serviços")
  })

  it("exceção da tool (sem código) ainda usa o texto pronto", () => {
    const steps = [
      { toolResults: [{ toolName: "addAppointment", isError: true, result: { error: true, message: "boom" } }] },
    ]

    expect(handleToolErrors(steps, logger)).toContain("tive dificuldade ao tentar agendar")
  })
})
