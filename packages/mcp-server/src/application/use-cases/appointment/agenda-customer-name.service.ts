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
 * cliente lá pelo nome. Antes de deixar isso acontecer, a IA precisa ter o nome
 * que a PRÓPRIA cliente informou. Duas situações barram:
 *
 *  1. o nome daqui não tem nenhuma letra (só emoji, ou é o telefone). Em
 *     03/nov/2026 um cliente "💤" não conseguiu agendar: a Belasis recusou o
 *     cadastro (422 "Nome possui carácter inválido");
 *  2. o nome tem letras, mas veio do perfil do WhatsApp e a cliente ainda não tem
 *     cadastro lá. Em 07/nov/2026 uma cliente foi cadastrada só como
 *     "Sil" e a recepção teve de pedir o sobrenome por mensagem dias depois.
 *
 * Quem já tem cadastro lá não é perguntado: o cadastro é reaproveitado, com o
 * nome que está lá. Sem agenda oficial, nada muda. O painel não passa por aqui.
 *
 * Devolve o erro a falhar, ou `null` para seguir.
 */
export async function checkCustomerNameForAgenda(input: {
  salonId: string
  customerId: string
  customerName: string
  operation: "create" | "reschedule"
}): Promise<CustomerNameRequiredError | null> {
  try {
    if (!hasLetter(input.customerName)) {
      if (!(await domainServices.hasActiveAgendaProvider(input.salonId))) return null
      return new CustomerNameRequiredError(input.customerId, input.operation, "no_letters")
    }

    const needsName = await domainServices.customerNeedsNameForAgenda({
      salonId: input.salonId,
      customerId: input.customerId,
    })
    return needsName === true
      ? new CustomerNameRequiredError(input.customerId, input.operation, "profile_name")
      : null
  } catch {
    // Não deu para saber se há agenda oficial (ex.: duas ativas). Segue: o
    // serviço de agendamento trava sozinho quando não consegue usá-la.
    return null
  }
}
