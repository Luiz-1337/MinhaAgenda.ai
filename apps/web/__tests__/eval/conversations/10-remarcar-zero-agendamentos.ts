import type { Conversation } from "../types"
import { NUNCA_PEDIR_TELEFONE } from "./_shared"

/**
 * Sem agendamentos futuros: ao pedir para remarcar, o bot deve informar que não
 * há agendamentos e oferecer agendar um novo — SEM pedir telefone e SEM tentar
 * remarcar/cancelar algo inexistente.
 */
export const conversation: Conversation = {
  name: "remarcar_zero_agendamentos",
  description: "Sem agendamentos, o bot informa e oferece agendar (sem pedir telefone)",
  context: {
    customerName: "Paula Teste",
    isNewCustomer: false,
    // sem seedAppointments → bloco "AGENDAMENTOS FUTUROS: nenhum"
  },
  turns: [
    {
      user: "quero remarcar meu horário",
      expect: {
        tools: {
          forbidden: ["updateAppointment", "removeAppointment"],
        },
        text: {
          maxSentences: 3,
          mustNotMatch: NUNCA_PEDIR_TELEFONE,
          // Deve sinalizar que não há agendamentos.
          mustMatchAny: [/n[ãa]o (tem|há|encontrei|possui)/i, /nenhum/i],
        },
      },
    },
  ],
}
