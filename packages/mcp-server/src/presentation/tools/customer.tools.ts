import { domainServices } from "@repo/db"
import { TOKENS } from "../../container"
import { unwrap } from "../../shared/types"
import { UpdateCustomerUseCase } from "../../application/use-cases/customer"
import { updateCustomerNameSchema } from "../schemas"
import { CustomerPresenter } from "../presenters"
import { defineTool } from "./defineTool"
import type { ToolContext, ToolSet } from "./types"

/** "Silvana" é só o primeiro nome; "Silvana Prado Lima" é nome completo. */
function isFullName(name: string): boolean {
  return name.split(/\s+/).filter((word) => /\p{L}/u.test(word)).length >= 2
}

/**
 * O salão cadastra a cliente na agenda oficial pelo nome? Só nesse caso vale
 * insistir no sobrenome. Na dúvida, não insiste.
 */
async function salonRegistersByName(salonId: string): Promise<boolean> {
  try {
    return (await domainServices.hasActiveAgendaProvider(salonId)) === true
  } catch {
    return false
  }
}

/**
 * Cria as tools de cliente
 * Nota: identifyCustomer foi removido — a identificação é automática no pipeline
 * (webhook identifica pelo telefone do WhatsApp, addAppointment faz identify internamente).
 */
export function createCustomerTools(ctx: ToolContext): ToolSet {
  return {
    updateCustomerName: defineTool(ctx, {
      description:
        "Grava o nome que a PRÓPRIA cliente informou nesta conversa (de preferência nome e sobrenome). " +
        "Chame logo depois de ela responder o nome. NUNCA chame com o nome do perfil do WhatsApp por conta própria, " +
        "nem com um nome que ela não tenha escrito: primeiro pergunte, depois grave.",
      inputSchema: updateCustomerNameSchema,
      handler: async (input, { container, salonId }) => {
        const result = await container
          .resolve<UpdateCustomerUseCase>(TOKENS.UpdateCustomerUseCase)
          .execute({
            customerId: input.customerId,
            name: input.name,
          })

        const customer = unwrap(result)
        const json = CustomerPresenter.toJSON(customer)

        // O nome já vale para agendar; o sobrenome é um pedido a mais, uma vez só.
        // Faltar sobrenome nunca impede o agendamento.
        if (!isFullName(customer.name) && (await salonRegistersByName(salonId))) {
          return {
            ...json,
            _instrucao:
              "Nome gravado, mas é só o primeiro nome. Peça o sobrenome UMA vez, de forma natural. " +
              "Se ela informar, chame updateCustomerName de novo com o nome completo. " +
              "Se ela preferir não informar ou não responder a isso, siga com o agendamento: não insista.",
          }
        }

        return json
      },
    }),
  }
}
