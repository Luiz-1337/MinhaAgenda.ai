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
 * Cria as tools do salão.
 *
 * salonId e clientPhone vêm do closure (contexto do WhatsApp resolvido pelo webhook).
 * As tools NUNCA devem aceitar esses IDs como input — caso contrário, a IA tende
 * a alucinar valores (ex: UUID nulo "00000000-0000-0000-0000-000000000000").
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
      execute: async () => {
        try {
          const useCase = container.resolve<GetSalonDetailsUseCase>(
            TOKENS.GetSalonDetailsUseCase
          )

          const result = await useCase.execute(salonId)

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return {
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
        "Salva uma preferência do cliente no CRM.",
      inputSchema: saveCustomerPreferenceSchema,
      execute: async (input) => {
        try {
          // Cliente sempre identificado via telefone do WhatsApp (closure).
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
          const customerId = identifyResult.data.id

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
