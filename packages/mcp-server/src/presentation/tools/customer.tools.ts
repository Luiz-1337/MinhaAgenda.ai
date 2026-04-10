import { Container, TOKENS } from "../../container"
import { isOk } from "../../shared/types"
import {
  UpdateCustomerUseCase,
} from "../../application/use-cases/customer"
import {
  updateCustomerNameSchema,
} from "../schemas"
import { CustomerPresenter, ErrorPresenter } from "../presenters"
import type { ToolSet } from "./types"

/**
 * Cria as tools de cliente
 * Nota: identifyCustomer foi removido — a identificação é automática no pipeline
 * (webhook identifica pelo telefone do WhatsApp, addAppointment faz identify internamente).
 */
export function createCustomerTools(
  container: Container,
  _salonId: string,
  _clientPhone: string
): ToolSet {
  return {
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
