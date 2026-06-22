import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import { ensureIsoWithTimezone } from "../../shared/utils"
import {
  CreateAppointmentUseCase,
  UpdateAppointmentUseCase,
  DeleteAppointmentUseCase,
  GetUpcomingAppointmentsUseCase,
} from "../../application/use-cases/appointment"
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
  getMyFutureAppointmentsSchema,
} from "../schemas"
import { AppointmentPresenter } from "../presenters"
import { defineTool } from "./defineTool"
import { resolveCustomerId } from "./tool-helpers"
import type { ToolContext, ToolSet } from "./types"

/**
 * Cria as tools de agendamento
 */
export function createAppointmentTools(ctx: ToolContext): ToolSet {
  return {
    addAppointment: defineTool(ctx, {
      description:
        "Cria um novo agendamento. REQUER professionalId e serviceId (obtidos via getServices e getProfessionals/checkAvailability) e date em formato ISO 8601. SEMPRE chame checkAvailability ANTES para confirmar disponibilidade.",
      inputSchema: createAppointmentSchema,
      handler: async (input, { container, salonId }) => {
        const customerId = await resolveCustomerId(ctx)

        const result = await container
          .resolve<CreateAppointmentUseCase>(TOKENS.CreateAppointmentUseCase)
          .execute({
            salonId,
            customerId,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            startsAt: ensureIsoWithTimezone(input.date),
            notes: input.notes,
          })

        return AppointmentPresenter.toJSON(unwrap(result))
      },
    }),

    updateAppointment: defineTool(ctx, {
      description:
        "Reagenda um agendamento existente. REQUER appointmentId (obtido via getMyFutureAppointments). Chame checkAvailability ANTES para confirmar o novo horário.",
      inputSchema: updateAppointmentSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<UpdateAppointmentUseCase>(TOKENS.UpdateAppointmentUseCase)
          .execute({
            appointmentId: input.appointmentId,
            salonId,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            startsAt: input.date ? ensureIsoWithTimezone(input.date) : undefined,
            notes: input.notes,
          })

        return AppointmentPresenter.toJSON(unwrap(result))
      },
    }),

    removeAppointment: defineTool(ctx, {
      description:
        "Cancela um agendamento. REQUER appointmentId (obtido via getMyFutureAppointments). Chame getMyFutureAppointments ANTES para obter o ID correto.",
      inputSchema: deleteAppointmentSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<DeleteAppointmentUseCase>(TOKENS.DeleteAppointmentUseCase)
          .execute(input.appointmentId, salonId)

        const data = unwrap(result)
        return {
          success: true,
          appointmentId: data.appointmentId,
          message: data.message,
        }
      },
    }),

    getMyFutureAppointments: defineTool(ctx, {
      description:
        "Lista os agendamentos futuros do cliente atual. Retorna IDs internos necessários para reagendar/cancelar. NÃO precisa de parâmetros — o cliente é identificado automaticamente pelo número do WhatsApp da sessão. NUNCA peça telefone ao cliente.",
      inputSchema: getMyFutureAppointmentsSchema,
      handler: async (_input, { container, salonId, clientPhone }) => {
        const result = await container
          .resolve<GetUpcomingAppointmentsUseCase>(TOKENS.GetUpcomingAppointmentsUseCase)
          .execute({
            salonId,
            customerId: undefined,
            phone: clientPhone,
          })

        return AppointmentPresenter.listToJSON(unwrap(result))
      },
    }),
  }
}
