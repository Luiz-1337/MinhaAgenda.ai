import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import { ensureIsoWithTimezone } from "../../shared/utils/date.utils"
import {
  CheckAvailabilityUseCase,
  GetAvailableSlotsUseCase,
} from "../../application/use-cases/availability"
import { GetProfessionalAvailabilityRulesUseCase } from "../../application/use-cases/salon"
import {
  checkAvailabilitySchema,
  getProfessionalAvailabilityRulesSchema,
} from "../schemas"
import { AvailabilityPresenter, ErrorPresenter } from "../presenters"
import type { ToolSet } from "./types"

/**
 * Cria as tools de disponibilidade
 */
export function createAvailabilityTools(
  container: Container,
  salonId: string,
  _clientPhone: string
): ToolSet {
  return {
    checkAvailability: {
      description:
        "Verifica horários disponíveis para agendamento. PRÉ-REQUISITO: Obter professionalId via getProfessionals se quiser filtrar por profissional.",
      inputSchema: checkAvailabilitySchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<CheckAvailabilityUseCase>(
            TOKENS.CheckAvailabilityUseCase
          )

          const result = await useCase.execute({
            salonId,
            date: ensureIsoWithTimezone(input.date),
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            serviceDuration: input.serviceDuration,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return AvailabilityPresenter.toJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },

    getAvailableSlots: {
      description:
        "Retorna apenas os horários disponíveis (filtrados) para agendamento.",
      inputSchema: checkAvailabilitySchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<GetAvailableSlotsUseCase>(
            TOKENS.GetAvailableSlotsUseCase
          )

          const result = await useCase.execute({
            salonId,
            date: ensureIsoWithTimezone(input.date),
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            serviceDuration: input.serviceDuration,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return AvailabilityPresenter.toJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },

    getProfessionalAvailabilityRules: {
      description:
        "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
      inputSchema: getProfessionalAvailabilityRulesSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<GetProfessionalAvailabilityRulesUseCase>(
            TOKENS.GetProfessionalAvailabilityRulesUseCase
          )

          const result = await useCase.execute({
            salonId,
            professionalName: input.professionalName,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
            professionalId: result.data.professionalId,
            professionalName: result.data.professionalName,
            rules: result.data.rules,
            message: result.data.message,
          }
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },
  }
}
