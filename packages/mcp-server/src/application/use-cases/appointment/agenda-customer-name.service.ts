import { domainServices } from "@repo/db"
import { CustomerNameRequiredError } from "../../../domain/errors"

/**
 * Nome com pelo menos uma letra, de qualquer alfabeto. "Ana 💇‍♀️" tem;
 * "💤" e "(11) 98604-9295" não.
 */
export function hasLetter(name: string): boolean {
  return /\p{L}/u.test(name)
}

/**
 * Com agenda oficial ativa (ex.: Belasis), agendar ou remarcar pode cadastrar o
 * cliente lá pelo nome, e lá o nome não se corrige depois. Se o nome daqui não
 * tem nenhuma letra, a IA precisa perguntar o nome antes. Sem agenda oficial,
 * nada muda. O painel não passa por aqui.
 *
 * Em 03/nov/2026 um cliente "💤" não conseguiu agendar: a Belasis recusou o
 * cadastro (422 "Nome possui carácter inválido"). Limpar o nome e cadastrar
 * "Cliente WhatsApp" evita o erro, mas enche a agenda da recepção de nomes iguais.
 *
 * Devolve o erro a falhar, ou `null` para seguir.
 */
export async function checkCustomerNameForAgenda(input: {
  salonId: string
  customerId: string
  customerName: string
  operation: "create" | "reschedule"
}): Promise<CustomerNameRequiredError | null> {
  if (hasLetter(input.customerName)) return null

  try {
    if (!(await domainServices.hasActiveAgendaProvider(input.salonId))) return null
  } catch {
    // Não deu para saber se há agenda oficial (ex.: duas ativas). Segue: o
    // serviço de agendamento trava sozinho quando não consegue usá-la.
    return null
  }

  return new CustomerNameRequiredError(input.customerId, input.operation)
}
