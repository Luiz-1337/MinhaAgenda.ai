import { describe, it, expect } from "vitest"
import { detectOptOutIntent } from "@/lib/services/retention/opt-out-detector"

describe("detectOptOutIntent", () => {
  describe("hard_opt_out (acao automatica)", () => {
    const cases = [
      "PARAR",
      "parar",
      "  parar  ",
      "Parar.",
      "STOP",
      "stop",
      "cancelar",
      "sair",
      "descadastrar",
      "Não quero mais",
      "Nao quero receber",
      "remover meu numero",
      "remova meu número",
    ]
    cases.forEach((input) => {
      it(`detecta hard opt-out em "${input}"`, () => {
        expect(detectOptOutIntent(input)).toBe("hard_opt_out")
      })
    })
  })

  describe("opt_in (reativacao)", () => {
    const cases = ["VOLTAR", "voltar", "Voltar.", "reativar", "opt-in", "OPT IN"]
    cases.forEach((input) => {
      it(`detecta opt-in em "${input}"`, () => {
        expect(detectOptOutIntent(input)).toBe("opt_in")
      })
    })
  })

  describe("soft_signal (apenas flag)", () => {
    const cases = [
      "me erra",
      "Chega de mensagens",
      "nao aguento mais",
      "para de mandar isso",
      "que saco esses recados",
      "to incomodada com isso",
      "me deixa em paz por favor",
      "para com isso",
    ]
    cases.forEach((input) => {
      it(`detecta soft signal em "${input}"`, () => {
        expect(detectOptOutIntent(input)).toBe("soft_signal")
      })
    })
  })

  describe("none (mensagens normais)", () => {
    const cases = [
      "Oi, tudo bem?",
      "Quero agendar pra amanha",
      "Pode confirmar meu horario?",
      "Obrigada!",
      "Quanto custa a progressiva?",
      "Bom dia",
      "",
    ]
    cases.forEach((input) => {
      it(`nao detecta opt-out em "${input}"`, () => {
        expect(detectOptOutIntent(input)).toBe("none")
      })
    })
  })

  it("hard tem precedencia sobre soft", () => {
    expect(detectOptOutIntent("parar")).toBe("hard_opt_out")
  })

  it("nao confunde palavras comuns", () => {
    // "para" sozinha em contexto natural NAO e opt-out
    expect(detectOptOutIntent("Vou para o salao agora")).toBe("none")
  })
})
