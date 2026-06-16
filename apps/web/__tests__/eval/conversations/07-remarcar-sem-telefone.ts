import type { Conversation } from "../types"
import { NUNCA_PEDIR_TELEFONE } from "./_shared"

/**
 * REGRESSÃO (caso real): cliente pede para remarcar e o bot respondia
 * "preciso localizar seu agendamento. Me confirma seu número com DDD?".
 *
 * Com o agendamento futuro injetado no contexto, o bot deve prosseguir SEM
 * pedir telefone/identificação. Há exatamente 1 agendamento → não precisa nem
 * perguntar qual; deve pedir a nova data/horário.
 */
export const conversation: Conversation = {
  name: "remarcar_sem_pedir_telefone",
  description: "Remarcar com 1 agendamento em aberto não pede telefone nem identificação",
  context: {
    customerName: "Maria Teste",
    isNewCustomer: false,
    seedAppointments: [{ inDays: 2 }],
  },
  turns: [
    {
      user: "oi, preciso mudar o horário do meu agendamento",
      expect: {
        tools: {
          // Não pode cancelar/criar nada ainda; no máximo listar.
          forbidden: ["removeAppointment", "addAppointment"],
        },
        text: {
          maxSentences: 3,
          mustNotMatch: NUNCA_PEDIR_TELEFONE,
        },
        custom: (result) => {
          // Deve avançar (perguntar a nova data) em vez de pedir identificação.
          return /\?/.test(result.text) ? null : "esperado uma pergunta de continuidade (nova data)"
        },
      },
    },
  ],
}
