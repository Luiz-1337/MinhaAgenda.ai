import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  IdentifyCustomerUseCase,
  UpdateCustomerUseCase,
} from "../../application/use-cases/customer"
import {
  identifyCustomerSchema,
  updateCustomerNameSchema,
} from "../schemas"
import { CustomerPresenter, ErrorPresenter } from "../presenters"
import type { ToolSet } from "./types"

/**
 * Cria as tools de cliente
 */
export function createCustomerTools(
  container: Container,
  salonId: string,
  clientPhone: string
): ToolSet {
  return {
    identifyCustomer: {
      description:
        "Identifica cliente existente pelo telefone. Se não encontrar, cria automaticamente. Use SEMPRE que precisar do customerId. Não precisa de parâmetros se o cliente já está conversando via WhatsApp.",
      inputSchema: identifyCustomerSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<IdentifyCustomerUseCase>(
            TOKENS.IdentifyCustomerUseCase
          )

          const result = await useCase.execute({
            phone: input.phone || clientPhone,
            name: input.name,
            salonId,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return CustomerPresenter.identificationToJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },

    updateCustomerName: {
      description:
        "Atualiza o nome de um cliente no sistema.",
      inputSchema: updateCustomerNameSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<UpdateCustomerUseCase>(
            TOKENS.UpdateCustomerUseCase
          )

          const result = await useCase.execute({
            customerId: input.customerId,
            name: input.name,
          })

          if (!isOk(result)) {
            return ErrorPresenter.format(result.error)
          }

          return CustomerPresenter.toJSON(result.data)
        } catch (error) {
          return ErrorPresenter.toJSON(error as Error)
        }
      },
    },
  }
}
