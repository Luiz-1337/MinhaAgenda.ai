/**
 * Google Calendar Tools - Vercel AI SDK Adapter
 *
 * Tools específicas do Google Calendar para uso com Vercel AI SDK.
 * Estas tools consultam a API do Google para disponibilidade e sincronizam eventos.
 *
 * Arquitetura:
 * - Tools são wrappers leves que delegam para Handlers especializados
 * - Handlers contêm toda a lógica de negócio e error handling
 * - Schemas validam inputs com padrões ISO 8601 robustos
 */

import { tool } from "ai"

import {
  CheckAvailabilityHandler,
  CreateAppointmentHandler,
  UpdateAppointmentHandler,
  DeleteAppointmentHandler,
} from "../src/handlers"

import {
  googleCheckAvailabilitySchema,
  googleCreateAppointmentSchema,
  googleUpdateAppointmentSchema,
  googleDeleteAppointmentSchema,
} from "../src/schemas/tools.schema"

/**
 * Cria tools específicas do Google Calendar para um salão e cliente
 *
 * @param salonId - ID do salão
 * @param clientPhone - Telefone do cliente (usado para identificação)
 * @returns Objeto com as tools do Google Calendar
 */
export function createGoogleCalendarTools(salonId: string, clientPhone: string) {
  // Instancia os handlers com o contexto do salão e cliente
  const checkAvailabilityHandler = new CheckAvailabilityHandler(salonId, clientPhone)
  const createAppointmentHandler = new CreateAppointmentHandler(salonId, clientPhone)
  const updateAppointmentHandler = new UpdateAppointmentHandler(salonId, clientPhone)
  const deleteAppointmentHandler = new DeleteAppointmentHandler(salonId, clientPhone)

  return {
    /**
     * Verifica horários disponíveis consultando o Google Calendar
     * Combina disponibilidade do banco com a API FreeBusy do Google
     */
    google_checkAvailability: tool({
      description:
        "Verifica horários disponíveis consultando o Google Calendar. " +
        "Combina disponibilidade do banco com a API FreeBusy do Google " +
        "para excluir slots ocupados no calendário do profissional.",
      inputSchema: googleCheckAvailabilitySchema,
      execute: async (input) => checkAvailabilityHandler.execute(input),
    }),

    /**
     * Cria um novo agendamento e sincroniza com o Google Calendar
     */
    google_createAppointment: tool({
      description:
        "Cria um novo agendamento e sincroniza com o Google Calendar. " +
        "O evento é criado tanto no banco de dados quanto no calendário do Google.",
      inputSchema: googleCreateAppointmentSchema,
      execute: async (input) => createAppointmentHandler.execute(input),
    }),

    /**
     * Atualiza um agendamento existente e sincroniza com o Google Calendar
     */
    google_updateAppointment: tool({
      description:
        "Atualiza um agendamento existente e sincroniza a alteração com o Google Calendar.",
      inputSchema: googleUpdateAppointmentSchema,
      execute: async (input) => updateAppointmentHandler.execute(input),
    }),

    /**
     * Remove um agendamento e deleta o evento do Google Calendar
     */
    google_deleteAppointment: tool({
      description:
        "Remove um agendamento do sistema e deleta o evento correspondente do Google Calendar.",
      inputSchema: googleDeleteAppointmentSchema,
      execute: async (input) => deleteAppointmentHandler.execute(input),
    }),
  }
}
