import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import { ensureIsoWithTimezone } from "../../shared/utils/date.utils"
import { CheckAvailabilityUseCase } from "../../application/use-cases/availability"
import { GetProfessionalAvailabilityRulesUseCase } from "../../application/use-cases/salon"
import {
  checkAvailabilitySchema,
  getProfessionalAvailabilityRulesSchema,
} from "../schemas"
import { AvailabilityPresenter } from "../presenters"
import { defineTool } from "./defineTool"
import type { ToolContext, ToolSet } from "./types"

/**
 * Cria as tools de disponibilidade
 */
export function createAvailabilityTools(ctx: ToolContext): ToolSet {
  return {
    checkAvailability: defineTool(ctx, {
      description:
        "Verifica horários disponíveis em uma data específica. REQUER date em formato ISO 8601 (ex: 2025-03-15T00:00:00-03:00). serviceId e professionalId são opcionais mas melhores resultados quando incluídos. NUNCA chame sem o cliente ter informado uma data.",
      inputSchema: checkAvailabilitySchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<CheckAvailabilityUseCase>(TOKENS.CheckAvailabilityUseCase)
          .execute({
            salonId,
            date: ensureIsoWithTimezone(input.date),
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            serviceDuration: input.serviceDuration,
          })

        return AvailabilityPresenter.toJSON(unwrap(result))
      },
    }),

    getProfessionalAvailabilityRules: defineTool(ctx, {
      description:
        "Verifica os turnos de trabalho de um profissional específico (ex: 'João trabalha terças e quintas?').",
      inputSchema: getProfessionalAvailabilityRulesSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<GetProfessionalAvailabilityRulesUseCase>(
            TOKENS.GetProfessionalAvailabilityRulesUseCase
          )
          .execute({
            salonId,
            professionalName: input.professionalName,
          })

        const data = unwrap(result)
        return {
          professionalId: data.professionalId,
          professionalName: data.professionalName,
          rules: data.rules,
          message: data.message,
        }
      },
    }),
  }
}
