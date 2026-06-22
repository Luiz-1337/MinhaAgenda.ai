import type { Conversation } from "../types"
import { NUNCA_PEDIR_TELEFONE } from "./_shared"

/**
 * Desambiguação: com 2+ agendamentos em aberto, ao pedir para remarcar o bot
 * deve perguntar QUAL deles (sem pedir telefone) e NÃO remarcar/cancelar antes
 * de o cliente escolher.
 */
export const conversation: Conversation = {
  name: "remarcar_multiplos_agendamentos",
  description: "Com vários agendamentos, o bot pergunta qual remarcar (sem pedir telefone)",
  context: {
    customerName: "Carla Teste",
    isNewCustomer: false,
    seedAppointments: [{ inDays: 2 }, { inDays: 5 }],
  },
  turns: [
    {
      user: "quero remarcar",
      expect: {
        tools: {
          // Ainda não sabe qual → não pode agir.
          forbidden: ["updateAppointment", "removeAppointment", "addAppointment"],
        },
        text: {
          mustNotMatch: NUNCA_PEDIR_TELEFONE,
          // Deve perguntar qual agendamento.
          mustMatchAny: [/qual/i],
        },
      },
    },
  ],
}
