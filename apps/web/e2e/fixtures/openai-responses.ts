/**
 * OpenAI response templates for testing
 */

import { OpenAIMockResponse } from "../mocks/openai-mock-server";

/**
 * Pre-defined AI responses for common scenarios
 */
export const AIResponses = {
  /**
   * Generic greeting response
   */
  greeting: (): OpenAIMockResponse => ({
    content: "Olá! Bem-vindo ao nosso salão. Como posso ajudá-lo hoje?",
  }),

  /**
   * Service list response
   */
  serviceList: (): OpenAIMockResponse => ({
    content: `Oferecemos os seguintes serviços:

*CORTE DE CABELO*
- Corte masculino: R$ 50,00
- Corte feminino: R$ 80,00

*COLORAÇÃO*
- Tintura simples: R$ 120,00
- Mechas: R$ 150,00

*TRATAMENTOS*
- Hidratação: R$ 60,00
- Progressiva: R$ 200,00

Gostaria de agendar algum desses serviços?`,
  }),

  /**
   * Appointment confirmation response
   */
  appointmentConfirmation: (
    date: string = "amanhã",
    time: string = "14h",
    service: string = "corte de cabelo"
  ): OpenAIMockResponse => ({
    content: `Perfeito! Confirmei seu agendamento:

*AGENDAMENTO CONFIRMADO*
- Serviço: ${service}
- Data: ${date}
- Horário: ${time}

Lembre-se de chegar com 10 minutos de antecedência. Até lá!`,
  }),

  /**
   * Availability options response
   */
  availabilityOptions: (): OpenAIMockResponse => ({
    content: `Tenho duas opções de horário para você:

*Opção 1:* Amanhã às 14h com Ana
*Opção 2:* Amanhã às 16h com João

Qual você prefere?`,
  }),

  /**
   * No availability response
   */
  noAvailability: (): OpenAIMockResponse => ({
    content: `Infelizmente não temos horário disponível para amanhã. 

Posso verificar disponibilidade para os próximos dias? Qual data seria melhor para você?`,
  }),

  /**
   * Price inquiry response
   */
  priceInquiry: (service: string = "corte de cabelo"): OpenAIMockResponse => ({
    content: `O valor do ${service} é R$ 50,00.

Gostaria de agendar este serviço?`,
  }),

  /**
   * Appointment cancellation response
   */
  appointmentCancellation: (): OpenAIMockResponse => ({
    content: `Seu agendamento foi cancelado com sucesso.

Caso precise reagendar, é só me chamar. Obrigado!`,
  }),

  /**
   * Error/fallback response
   */
  error: (): OpenAIMockResponse => ({
    content: "Desculpe, encontrei uma dificuldade técnica. Posso ajudar com outra coisa?",
  }),

  /**
   * Ask for clarification response
   */
  askClarification: (): OpenAIMockResponse => ({
    content: "Desculpe, não entendi. Você poderia repetir ou dar mais detalhes?",
  }),

  /**
   * Response with tool call (check availability)
   */
  checkAvailabilityToolCall: (): OpenAIMockResponse => ({
    toolCalls: [
      {
        id: "call_test123",
        type: "function",
        function: {
          name: "checkAvailability",
          arguments: JSON.stringify({
            date: "2024-01-28",
            serviceId: "service-123",
          }),
        },
      },
    ],
  }),

  /**
   * Response with tool call (create appointment)
   */
  createAppointmentToolCall: (
    date: string = "2024-01-28",
    time: string = "14:00"
  ): OpenAIMockResponse => ({
    toolCalls: [
      {
        id: "call_test456",
        type: "function",
        function: {
          name: "addAppointment",
          arguments: JSON.stringify({
            date,
            time,
            serviceId: "service-123",
            professionalId: "professional-123",
          }),
        },
      },
    ],
  }),

  /**
   * Response with tool call (list services)
   */
  listServicesToolCall: (): OpenAIMockResponse => ({
    toolCalls: [
      {
        id: "call_test789",
        type: "function",
        function: {
          name: "getServices",
          arguments: JSON.stringify({}),
        },
      },
    ],
  }),

  /**
   * Custom response
   */
  custom: (content: string): OpenAIMockResponse => ({
    content,
  }),

  /**
   * API error response
   */
  apiError: (message: string = "Internal server error"): OpenAIMockResponse => ({
    error: message,
    status: 500,
  }),

  /**
   * Rate limit error response
   */
  rateLimitError: (): OpenAIMockResponse => ({
    error: "Rate limit exceeded. Please try again later.",
    status: 429,
  }),
};

/**
 * Creates a sequence of responses for multi-turn conversations
 */
export function createConversationResponses(
  responses: OpenAIMockResponse[]
): OpenAIMockResponse[] {
  return responses;
}

/**
 * Common conversation flows
 */
export const ConversationFlows = {
  /**
   * Full appointment booking flow
   */
  appointmentBooking: (): OpenAIMockResponse[] => [
    AIResponses.greeting(),
    AIResponses.availabilityOptions(),
    AIResponses.appointmentConfirmation(),
  ],

  /**
   * Service inquiry flow
   */
  serviceInquiry: (): OpenAIMockResponse[] => [
    AIResponses.greeting(),
    AIResponses.serviceList(),
  ],

  /**
   * Appointment cancellation flow
   */
  appointmentCancellation: (): OpenAIMockResponse[] => [
    AIResponses.appointmentCancellation(),
  ],
};
