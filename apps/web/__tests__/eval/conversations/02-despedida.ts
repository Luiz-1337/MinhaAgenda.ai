import type { Conversation } from "../types"

/**
 * Despedida. Cliente encerra a conversa — bot agradece curto, zero tools.
 */
export const conversation: Conversation = {
  name: "despedida",
  description: "Cliente se despede — bot responde cordial sem chamar nenhuma tool",
  context: {
    customerName: "Joana Souza",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "tchau, obrigada!",
      expect: {
        tools: {
          forbidden: [
            "checkAvailability",
            "addAppointment",
            "updateAppointment",
            "removeAppointment",
            "getMyFutureAppointments",
            "getServices",
            "getProfessionals",
            "getProducts",
            "createCustomer",
          ],
        },
        text: {
          maxSentences: 2,
          maxChars: 200,
          mustNotMatch: [
            /\?/, // despedida não devolve pergunta
            /um momento/i,
            /vou verificar/i,
          ],
        },
      },
    },
  ],
}
