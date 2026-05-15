import type { Conversation } from "../types"

/**
 * Cliente pede agendamento sem informar a data. Bot DEVE perguntar a data,
 * NÃO pode chamar checkAvailability sem data (regra do prompt).
 */
export const conversation: Conversation = {
  name: "agendamento_solicita_data",
  description: "Sem data informada, bot deve perguntar — não chamar checkAvailability às cegas",
  context: {
    customerName: "Patrícia Lima",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "queria agendar um corte",
      expect: {
        tools: {
          // checkAvailability é proibido sem data (regra explícita no prompt)
          forbidden: ["checkAvailability", "addAppointment"],
        },
        text: {
          maxSentences: 2,
          // Exatamente uma pergunta — regra "uma pergunta por vez"
          mustMatchAny: [/\?/],
          mustNotMatch: [
            /um momento/i,
            /vou verificar/i,
            /aguarde/i,
            // Não deve listar horários inventados
            /\b\d{1,2}h\b.*\b\d{1,2}h\b/i,
          ],
        },
        custom: (result) => {
          // Conta pontos de interrogação — deve ter no máximo 1
          const questionMarks = (result.text.match(/\?/g) || []).length
          if (questionMarks > 1) {
            return `expected at most 1 question, got ${questionMarks}`
          }
          return null
        },
      },
    },
  ],
}
