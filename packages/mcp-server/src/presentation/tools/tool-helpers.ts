import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import { CustomerNotFoundError } from "../../domain/errors"
import { IdentifyCustomerUseCase } from "../../application/use-cases/customer"
import type { ToolContext } from "./types"

/**
 * Resolve o id do cliente pelo telefone do contexto (closure do WhatsApp).
 * Lança `CustomerNotFoundError` se não houver cadastro — o `defineTool`
 * converte no shape de erro padrão.
 *
 * Compartilhado por `addAppointment` e `saveCustomerPreference`.
 */
export async function resolveCustomerId(ctx: ToolContext): Promise<string> {
  const identify = ctx.container.resolve<IdentifyCustomerUseCase>(
    TOKENS.IdentifyCustomerUseCase
  )
  const result = await identify.execute({ phone: ctx.clientPhone, salonId: ctx.salonId })
  const customer = unwrap(result)
  if (!customer.id) {
    throw new CustomerNotFoundError()
  }
  return customer.id
}
