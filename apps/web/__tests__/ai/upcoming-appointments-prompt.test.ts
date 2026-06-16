import { describe, expect, it } from "vitest"
import { formatUpcomingAppointmentsText } from "@/lib/services/ai/system-prompt-builder.service"

/**
 * Bloco AGENDAMENTOS FUTUROS injetado no system prompt.
 *
 * É o coração da correção de "pedir telefone para remarcar": com os agendamentos
 * (e seus IDs internos) sempre no contexto, o agente remarca/cancela sem pedir
 * telefone nem re-localizar. Estes testes travam o formato e as instruções.
 */
describe("formatUpcomingAppointmentsText", () => {
  it("retorna vazio quando a lista é desconhecida (null/undefined) — não afirma nada", () => {
    expect(formatUpcomingAppointmentsText(null)).toBe("")
    expect(formatUpcomingAppointmentsText(undefined)).toBe("")
  })

  it("quando vazia: afirma que não há agendamentos, oferece agendar e proíbe pedir telefone", () => {
    const text = formatUpcomingAppointmentsText([])
    expect(text).toMatch(/nenhum/i)
    expect(text).toMatch(/ofereça agendar/i)
    expect(text).toMatch(/NUNCA peça telefone/i)
  })

  it("lista numerada com id interno + instrução de não exibir o id nem pedir telefone", () => {
    const text = formatUpcomingAppointmentsText([
      { id: "apt-1", serviceName: "Corte", professionalName: "Cris", startsAt: "12/06/2026 às 16:30" },
      { id: "apt-2", serviceName: "Escova", professionalName: "Ana", startsAt: "13/06/2026 às 10:00" },
    ])
    expect(text).toMatch(/1\. Corte com Cris — 12\/06\/2026 às 16:30/)
    expect(text).toMatch(/2\. Escova com Ana — 13\/06\/2026 às 10:00/)
    expect(text).toContain("apt-1")
    expect(text).toContain("apt-2")
    expect(text).toMatch(/NUNCA mostre ao cliente/i)
    expect(text).toMatch(/NUNCA peça telefone/i)
  })

  it("limita a 10 agendamentos exibidos", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      id: `apt-${i}`,
      serviceName: "Corte",
      professionalName: "Cris",
      startsAt: `dia ${i}`,
    }))
    const text = formatUpcomingAppointmentsText(many)
    expect(text).toContain("10. Corte")
    expect(text).not.toContain("11. Corte")
  })
})
