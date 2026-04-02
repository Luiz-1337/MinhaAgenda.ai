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
        "Verifica horários disponíveis em uma data específica. REQUER date em formato ISO 8601 (ex: 2025-03-15T00:00:00-03:00). serviceId e professionalId são opcionais mas melhores resultados quando incluídos. NUNCA chame sem o cliente ter informado uma data.",
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
        "Retorna apenas horários disponíveis (já filtrados, sem indisponíveis). Use checkAvailability como alternativa principal. Mesmos parâmetros que checkAvailability.",
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
