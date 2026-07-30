import { describe, it, expect } from "vitest"
import {
  appointmentStatusLabel,
  appointmentStatusStyle,
  isTerminalStatus,
  availableOutcomes,
} from "@/lib/utils/appointment-status"

const AGORA = new Date("2026-07-27T15:00:00Z")

/** Agendamento de 1h, com o início deslocado em horas a partir de AGORA. */
function apt(offsetHoras: number, status = "pending") {
  const startTime = new Date(AGORA.getTime() + offsetHoras * 3600_000)
  return { status, startTime, endTime: new Date(startTime.getTime() + 3600_000) }
}

describe("appointmentStatusLabel", () => {
  it("traduz os cinco status", () => {
    expect(appointmentStatusLabel("pending")).toBe("Pendente")
    expect(appointmentStatusLabel("confirmed")).toBe("Confirmado")
    expect(appointmentStatusLabel("cancelled")).toBe("Cancelado")
    expect(appointmentStatusLabel("completed")).toBe("Concluído")
    expect(appointmentStatusLabel("no_show")).toBe("Não compareceu")
  })

  it("NUNCA devolve o valor cru do banco", () => {
    // O fallback antigo era imprimir o proprio status: 'no_show' apareceria assim
    // na tela do dono. Um status novo tem que virar "—", nao vazar o enum.
    expect(appointmentStatusLabel("in_progress")).toBe("—")
    expect(appointmentStatusLabel("qualquer_coisa")).toBe("—")
    expect(appointmentStatusLabel(null)).toBe("—")
    expect(appointmentStatusLabel(undefined)).toBe("—")
  })
})

describe("appointmentStatusStyle", () => {
  it("falta e cancelamento tem cores DIFERENTES", () => {
    // Confundir os dois na grade apaga a diferenca entre "o cliente avisou" e "o
    // cliente nao apareceu" -- que e exatamente o que o dono precisa distinguir.
    expect(appointmentStatusStyle("no_show").bg).not.toBe(appointmentStatusStyle("cancelled").bg)
  })

  it("status desconhecido cai no fallback, sem quebrar", () => {
    expect(appointmentStatusStyle("marciano").bg).toBeTruthy()
  })
})

describe("isTerminalStatus", () => {
  it("os tres desfechos sao terminais", () => {
    expect(isTerminalStatus("completed")).toBe(true)
    expect(isTerminalStatus("cancelled")).toBe(true)
    expect(isTerminalStatus("no_show")).toBe(true)
  })

  it("em aberto nao e terminal", () => {
    expect(isTerminalStatus("pending")).toBe(false)
    expect(isTerminalStatus("confirmed")).toBe(false)
    expect(isTerminalStatus(null)).toBe(false)
  })
})

/**
 * Esta e a regra que aparece em TRES lugares: os botoes do dialogo, o selo
 * "N atendimentos aguardando fechamento" e o cron de fechamento. Divergirem seria
 * o dono ver "3 pendentes" e nao conseguir fechar 3.
 */
describe("availableOutcomes", () => {
  it("agendamento FUTURO: so da para cancelar", () => {
    const r = availableOutcomes(apt(+5), AGORA)
    expect(r).toEqual({
      canComplete: false,
      canMarkNoShow: false,
      canCancel: true,
      isSettled: false,
    })
  })

  it("EM ANDAMENTO: da para concluir, ainda nao da para marcar falta", () => {
    // Comecou 30min atras, termina em 30min. Quem esta no balcao sabe que acabou
    // mais cedo -- mas o cliente que esta na cadeira nao faltou.
    const emCurso = { status: "confirmed", startTime: new Date(AGORA.getTime() - 1800_000), endTime: new Date(AGORA.getTime() + 1800_000) }
    const r = availableOutcomes(emCurso, AGORA)
    expect(r.canComplete).toBe(true)
    expect(r.canMarkNoShow).toBe(false)
    expect(r.canCancel).toBe(true)
  })

  it("PASSADO: da para concluir, marcar falta e cancelar", () => {
    const r = availableOutcomes(apt(-5), AGORA)
    expect(r.canComplete).toBe(true)
    expect(r.canMarkNoShow).toBe(true)
    expect(r.canCancel).toBe(true)
  })

  it("no instante EXATO do inicio ja da para concluir", () => {
    expect(availableOutcomes(apt(0), AGORA).canComplete).toBe(true)
  })

  it("no instante EXATO do fim ja da para marcar falta", () => {
    const terminandoAgora = { status: "pending", startTime: new Date(AGORA.getTime() - 3600_000), endTime: AGORA }
    expect(availableOutcomes(terminandoAgora, AGORA).canMarkNoShow).toBe(true)
  })

  it.each(["completed", "cancelled", "no_show"])(
    "%s ja tem desfecho: nenhuma acao, nem cancelar",
    (status) => {
      // Cancelar um atendimento ja concluido sumiria com receita contabilizada.
      const r = availableOutcomes(apt(-5, status), AGORA)
      expect(r).toEqual({
        canComplete: false,
        canMarkNoShow: false,
        canCancel: false,
        isSettled: true,
      })
    }
  )

  it("cancelar vale tambem no passado (limpar a agenda de ontem)", () => {
    expect(availableOutcomes(apt(-48), AGORA).canCancel).toBe(true)
  })
})
