import type { Conversation } from "../types"
import {
  extractCandidateValues,
  flattenToolResultsText,
} from "../runner/assertions"

/**
 * Cliente pergunta o preço de um serviço. Bot DEVE consultar via tool — não
 * pode inventar preço. Qualquer valor numérico mencionado tem que aparecer
 * em algum resultado de tool chamado neste turno.
 */
export const conversation: Conversation = {
  name: "lista_servicos",
  description: "Bot precisa chamar getServices antes de citar preços; não pode inventar valores",
  context: {
    customerName: "Carla Mendes",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "quanto custa um corte?",
      expect: {
        tools: {
          required: ["getServices"],
          forbidden: ["addAppointment", "checkAvailability"],
        },
        text: {
          maxSentences: 3,
          mustNotMatch: [
            /um momento/i,
            /vou verificar/i,
            /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
          ],
        },
        // Antiinvenção: cada valor monetário citado na resposta tem que aparecer
        // em algum resultado de tool. Hours não são checadas (sem horário aqui).
        custom: (result, steps) => {
          const candidates = extractCandidateValues(result.text)
          if (candidates.length === 0) return null

          const toolText = flattenToolResultsText(steps)
          if (!toolText) {
            return `mentioned values [${candidates.join(", ")}] but no tool results were captured`
          }

          // Normaliza para comparação: remove espaços, troca vírgula por ponto
          const normalize = (s: string) =>
            s.replace(/\s/g, "").replace(/,/g, ".").toUpperCase()
          const normalizedToolText = normalize(toolText)

          for (const candidate of candidates) {
            // Ignora padrões de horário (XhYY ou X:YY) — só checa preços nessa conversa
            if (/^\d{1,2}[h:]/.test(candidate)) continue
            const normalizedCandidate = normalize(candidate).replace(/^R\$/, "")
            if (!normalizedToolText.includes(normalizedCandidate)) {
              return `mentioned price "${candidate}" but it does not appear in any tool result`
            }
          }
          return null
        },
      },
    },
  ],
}
