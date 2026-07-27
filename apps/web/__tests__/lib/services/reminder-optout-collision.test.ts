import { describe, it, expect } from "vitest"
import { buildReminderMessage } from "@/lib/services/reminders.message"
import { detectOptOutIntent } from "@/lib/services/retention/opt-out-detector"

/**
 * GUARDA DE REGRESSÃO — bug de produção confirmado em 26/07/2026.
 *
 * O lembrete pedia "responda *CANCELAR*". A palavra `cancelar` estava no
 * HARD_OPT_OUT_REGEX, e o worker faz curto-circuito na ETAPA 0, ANTES da IA:
 * o cliente respondia achando que tinha desmarcado o horário e o que acontecia
 * era um descadastro de marketing (customers.opted_out_at). O agendamento
 * continuava na agenda e ninguém era avisado.
 *
 * Estes testes travam a regra nos DOIS lados: nenhuma palavra-chave que o
 * lembrete pede pode ser engolida pelo detector, e o detector não pode voltar a
 * classificar "cancelar" como descadastro.
 */

const SAMPLE = buildReminderMessage({
  firstName: "Ana",
  salonName: "Spettacolo Salone",
  serviceName: "Corte de cabelo",
  professionalName: "Michele",
  when: "sexta-feira, 31 de julho às 14:00",
})

/**
 * Extrai as palavras-chave que o lembrete manda o cliente responder.
 * Convenção do texto: palavra em CAIXA ALTA entre asteriscos (*SIM*).
 * Nome de salão/serviço em negrito não entra porque não é caixa alta.
 */
function extractInstructedKeywords(body: string): string[] {
  return Array.from(body.matchAll(/\*([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,})\*/g)).map((m) => m[1])
}

describe("lembrete x detector de opt-out", () => {
  it("o lembrete pede pelo menos uma palavra-chave", () => {
    // Se alguém remover todas as palavras-chave, o teste abaixo passaria vazio
    // e a guarda viraria decoração. Este caso impede isso.
    expect(extractInstructedKeywords(SAMPLE).length).toBeGreaterThan(0)
  })

  it("nenhuma palavra-chave pedida pelo lembrete dispara opt-out ou opt-in", () => {
    for (const keyword of extractInstructedKeywords(SAMPLE)) {
      expect(
        detectOptOutIntent(keyword),
        `A palavra "${keyword}" pedida no lembrete é interceptada pelo detector ` +
          `de opt-out e NUNCA chega na IA. Escolha outra palavra ou ajuste o detector.`
      ).toBe("none")
    }
  })

  it("o lembrete nao pede CANCELAR (a colisao original)", () => {
    expect(extractInstructedKeywords(SAMPLE)).not.toContain("CANCELAR")
  })

  it("o lembrete nao pede CONFIRMAR sem handler — usa SIM", () => {
    // "CONFIRMAR" não colide com o detector, mas era pedido sem nenhuma tool
    // que o atendesse. Hoje o fluxo é SIM -> confirmAppointment.
    expect(extractInstructedKeywords(SAMPLE)).toContain("SIM")
  })

  it("a resposta esperada ao lembrete chega na IA", () => {
    for (const reply of ["SIM", "sim", "Sim.", " sim "]) {
      expect(detectOptOutIntent(reply)).toBe("none")
    }
  })

  it("quem responde o lembrete querendo desmarcar tambem chega na IA", () => {
    // O lembrete diz "é só me escrever aqui". Essas frases têm que passar.
    const replies = [
      "cancelar",
      "quero cancelar",
      "pode cancelar",
      "preciso remarcar",
      "nao vou conseguir ir",
    ]
    for (const reply of replies) {
      expect(
        detectOptOutIntent(reply),
        `"${reply}" seria engolido pelo detector e o cliente ficaria sem cancelamento.`
      ).toBe("none")
    }
  })

  it("o opt-out de verdade continua funcionando", () => {
    for (const reply of ["PARAR", "sair", "descadastrar", "nao quero mais"]) {
      expect(detectOptOutIntent(reply)).toBe("hard_opt_out")
    }
  })
})
