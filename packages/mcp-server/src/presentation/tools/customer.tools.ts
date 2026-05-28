import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import { UpdateCustomerUseCase } from "../../application/use-cases/customer"
import { updateCustomerNameSchema } from "../schemas"
import { CustomerPresenter } from "../presenters"
import { defineTool } from "./defineTool"
import type { ToolContext, ToolSet } from "./types"

/**
 * Cria as tools de cliente
 * Nota: identifyCustomer foi removido — a identificação é automática no pipeline
 * (webhook identifica pelo telefone do WhatsApp, addAppointment faz identify internamente).
 */
export function createCustomerTools(ctx: ToolContext): ToolSet {
  return {
    updateCustomerName: defineTool(ctx, {
      description: "Atualiza o nome de um cliente no sistema.",
      inputSchema: updateCustomerNameSchema,
      handler: async (input, { container }) => {
        const result = await container
          .resolve<UpdateCustomerUseCase>(TOKENS.UpdateCustomerUseCase)
          .execute({
            customerId: input.customerId,
            name: input.name,
          })

        return CustomerPresenter.toJSON(unwrap(result))
      },
    }),
  }
}
