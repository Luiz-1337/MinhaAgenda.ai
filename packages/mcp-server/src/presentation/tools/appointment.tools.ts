import { tool } from "ai"
import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import { ensureIsoWithTimezone } from "../../shared/utils/date.utils"
import {
  CreateAppointmentUseCase,
  UpdateAppointmentUseCase,
  DeleteAppointmentUseCase,
  GetUpcomingAppointmentsUseCase,
} from "../../application/use-cases/appointment"
import { IdentifyCustomerUseCase } from "../../application/use-cases/customer"
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  deleteAppointmentSchema,
  getMyFutureAppointmentsSchema,
} from "../schemas"
import { AppointmentPresenter, ErrorPresenter } from "../presenters"

/**
 * Cria as tools de agendamento
 */
export function createAppointmentTools(
  container: Container,
  salonId: string,
  clientPhone: string
) {
  return {
    addAppointment: tool({
      description:
        "Cria um novo agendamento para o cliente. PRÉ-REQUISITOS: Cliente identificado, professionalId e serviceId obtidos via getProfessionals e getServices.",
      inputSchema: createAppointmentSchema,
      execute: async (input) => {
        try {
          // Primeiro identifica o cliente
          const identifyUseCase = container.resolve<IdentifyCustomerUseCase>(
            TOKENS.IdentifyCustomerUseCase
          )
          const identifyResult = await identifyUseCase.execute({
            phone: clientPhone,
            salonId,
          })

          if (!isOk(identifyResult) || !identifyResult.data.id) {
            return ErrorPresenter.format(
              new Error("Cliente não identificado. Forneça o nome primeiro.")
            )
          }

          const createUseCase = container.resolve<CreateAppointmentUseCase>(
            TOKENS.CreateAppointmentUseCase
          )

          const result = await createUseCase.execute({
            salonId,
            customerId: identifyResult.data.id,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            startsAt: ensureIsoWithTimezone(input.date),
            notes: input.notes,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return AppointmentPresenter.toJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),

    updateAppointment: tool({
      description:
        "Atualiza um agendamento existente (reagendamento). PRÉ-REQUISITO: Obter appointmentId via getMyFutureAppointments.",
      inputSchema: updateAppointmentSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<UpdateAppointmentUseCase>(
            TOKENS.UpdateAppointmentUseCase
          )

          const result = await useCase.execute({
            appointmentId: input.appointmentId,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            startsAt: input.date ? ensureIsoWithTimezone(input.date) : undefined,
            notes: input.notes,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return AppointmentPresenter.toJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),

    removeAppointment: tool({
      description:
        "Cancela um agendamento existente. PRÉ-REQUISITO: Obter appointmentId via getMyFutureAppointments.",
      inputSchema: deleteAppointmentSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<DeleteAppointmentUseCase>(
            TOKENS.DeleteAppointmentUseCase
          )

          const result = await useCase.execute(input.appointmentId)

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
            success: true,
            appointmentId: result.data.appointmentId,
            message: result.data.message,
          }
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),

    getMyFutureAppointments: tool({
      description:
        "Lista agendamentos futuros do cliente atual. Use esta tool SEMPRE antes de cancelar ou reagendar para obter os IDs.",
      inputSchema: getMyFutureAppointmentsSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<GetUpcomingAppointmentsUseCase>(
            TOKENS.GetUpcomingAppointmentsUseCase
          )

          const result = await useCase.execute({
            salonId,
            customerId: input.clientId,
            phone: input.phone || clientPhone,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return AppointmentPresenter.listToJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    }),
  }
}
