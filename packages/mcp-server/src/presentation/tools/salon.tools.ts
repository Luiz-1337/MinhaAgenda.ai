import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  GetSalonDetailsUseCase,
  SaveCustomerPreferenceUseCase,
  QualifyLeadUseCase,
} from "../../application/use-cases/salon"
import { IdentifyCustomerUseCase } from "../../application/use-cases/customer"
import {
  getSalonInfoSchema,
  saveCustomerPreferenceSchema,
  qualifyLeadSchema,
} from "../schemas"
import { ErrorPresenter } from "../presenters"
import type { ToolSet } from "./types"

/**
 * Normaliza input que pode vir como undefined
 * quando a IA chama uma tool sem argumentos
 */
function normalizeInput<T>(input: T | undefined): T {
  return (input ?? {}) as T
}

/**
 * Cria as tools do salão
 */
export function createSalonTools(
  container: Container,
  salonId: string,
  clientPhone: string
): ToolSet {
  return {
    getSalonInfo: {
      description:
        "Retorna informações do salão: nome, endereço, horários de funcionamento, política de cancelamento.",
      inputSchema: getSalonInfoSchema,
      execute: async (input) => {
        try {
          const params = normalizeInput(input)
          void params

          const useCase = container.resolve<GetSalonDetailsUseCase>(
            TOKENS.GetSalonDetailsUseCase
          )

          const result = await useCase.execute(salonId)

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
            id: result.data.id,
            name: result.data.name,
            address: result.data.address,
            phone: result.data.phone,
            description: result.data.description,
            cancellationPolicy: result.data.cancellationPolicy,
            businessHours: result.data.businessHours,
            message: result.data.message,
          }
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },

    saveCustomerPreference: {
      description:
        "Salva uma preferência do cliente no CRM do salão. Útil para armazenar informações extraídas da conversa (ex: alergias, preferências).",
      inputSchema: saveCustomerPreferenceSchema,
      execute: async (input) => {
        try {
          // Se não tiver customerId, tenta identificar pelo telefone
          let customerId = input.customerId
          if (!customerId) {
            const identifyUseCase = container.resolve<IdentifyCustomerUseCase>(
              TOKENS.IdentifyCustomerUseCase
            )
            const identifyResult = await identifyUseCase.execute({
              phone: clientPhone,
              salonId,
            })

            if (!isOk(identifyResult) || !identifyResult.data.id) {
              return ErrorPresenter.format(
                new Error("Não foi possível identificar o cliente")
              )
            }
            customerId = identifyResult.data.id
          }

          const useCase = container.resolve<SaveCustomerPreferenceUseCase>(
            TOKENS.SaveCustomerPreferenceUseCase
          )

          const result = await useCase.execute({
            salonId,
            customerId,
            key: input.key,
            value: input.value,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
            customerId: result.data.customerId,
            key: result.data.key,
            value: result.data.value,
            message: result.data.message,
          }
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },

    qualifyLead: {
      description:
        "Qualifica um lead baseado no nível de interesse demonstrado.",
      inputSchema: qualifyLeadSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<QualifyLeadUseCase>(
            TOKENS.QualifyLeadUseCase
          )

          const result = await useCase.execute({
            salonId,
            phoneNumber: input.phoneNumber || clientPhone,
            interest: input.interest,
            notes: input.notes,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
            leadId: result.data.leadId,
            status: result.data.status,
            message: result.data.message,
          }
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },
  }
}
