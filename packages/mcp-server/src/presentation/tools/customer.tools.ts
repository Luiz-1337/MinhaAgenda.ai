import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  IdentifyCustomerUseCase,
  CreateCustomerUseCase,
  UpdateCustomerUseCase,
} from "../../application/use-cases/customer"
import {
  identifyCustomerSchema,
  createCustomerSchema,
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
        "Identifica ou cria um cliente pelo telefone.",
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

    createCustomer: {
      description:
        "Cria um novo cliente no sistema.",
      inputSchema: createCustomerSchema,
      execute: async (input) => {
        try {
          const useCase = container.resolve<CreateCustomerUseCase>(
            TOKENS.CreateCustomerUseCase
          )

          const result = await useCase.execute({
            salonId,
            phone: input.phone || clientPhone,
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
