import type { Conversation } from "../types"
import { NUNCA_PEDIR_TELEFONE } from "./_shared"

/**
 * Cancelar com 1 agendamento em aberto: o bot deve confirmar o cancelamento
 * (ou pedir confirmação) SEM pedir telefone/identificação.
 */
export const conversation: Conversation = {
  name: "cancelar_sem_pedir_telefone",
  description: "Cancelar com 1 agendamento em aberto não pede telefone nem identificação",
  context: {
    customerName: "Joana Teste",
    isNewCustomer: false,
    seedAppointments: [{ inDays: 3 }],
  },
  turns: [
    {
      user: "quero cancelar meu agendamento",
      expect: {
        tools: {
          // Não pode reagendar nem criar nada num pedido de cancelamento.
          forbidden: ["updateAppointment", "addAppointment"],
        },
        text: {
          maxSentences: 3,
          mustNotMatch: NUNCA_PEDIR_TELEFONE,
        },
      },
    },
  ],
}
