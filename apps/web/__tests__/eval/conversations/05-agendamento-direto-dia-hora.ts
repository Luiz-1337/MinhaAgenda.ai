import type { Conversation } from "../types"

/**
 * Cliente informa serviço + data + horário na mesma mensagem.
 * Bot DEVE chamar checkAvailability com horário específico (não às cegas).
 * NÃO pode chamar addAppointment ainda (precisa cliente confirmar).
 * Resposta deve ser sucinta, sem anunciar verificação.
 */
export const conversation: Conversation = {
  name: "agendamento_direto_dia_hora",
  description: "Cliente diz serviço + dia + hora — bot chama checkAvailability sem prefácio, sem agendar ainda",
  context: {
    customerName: "Beatriz Costa",
    isNewCustomer: false,
  },
  turns: [
    {
      user: "queria agendar um corte na próxima sexta-feira às 10h",
      expect: {
        tools: {
          required: ["checkAvailability"],
          forbidden: ["addAppointment", "updateAppointment", "removeAppointment"],
          args: {
            // Root-cause check: o modelo deve converter "próxima sexta às 10h"
            // para ISO 8601 (data + hora com segundos), não passar texto natural.
            // O fuso é opcional aqui — o schema aceita com/sem TZ e o handler
            // normaliza via ensureIsoWithTimezone.
            checkAvailability: {
              mustHaveKeys: ["date"],
              matches: {
                date: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
              },
            },
          },
        },
        text: {
          maxSentences: 4,
          mustNotMatch: [
            /um momento/i,
            /vou verificar/i,
            /vou checar/i,
            /aguarde/i,
            /deixa eu ver/i,
            /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
            // Bot não deve perguntar qual horário se cliente já disse 10h
            /qual\s+prefer|qual\s+hor[aá]rio.*prefer/i,
          ],
        },
      },
    },
  ],
}
