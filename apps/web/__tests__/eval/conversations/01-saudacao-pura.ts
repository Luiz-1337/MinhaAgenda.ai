import type { Conversation } from "../types"

/**
 * Saudação pura. O bot deve responder uma frase curta, sem chamar tools,
 * sem anunciar verificação ("vou verificar", "um momento").
 */
export const conversation: Conversation = {
  name: "saudacao_pura",
  description: "Cliente diz oi — bot responde curto, sem tools, sem anunciar verificação",
  context: {
    customerName: "Maria Silva",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "oi",
      expect: {
        tools: {
          forbidden: [
            "checkAvailability",
            "addAppointment",
            "updateAppointment",
            "removeAppointment",
            "getMyFutureAppointments",
            "createCustomer",
            "updateCustomerName",
          ],
        },
        text: {
          maxSentences: 2,
          maxChars: 220,
          mustNotMatch: [
            /um momento/i,
            /vou verificar/i,
            /vou checar/i,
            /aguarde/i,
            /deixa eu ver/i,
            /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
            /TOOL_CONTEXT/,
          ],
        },
      },
    },
  ],
}
