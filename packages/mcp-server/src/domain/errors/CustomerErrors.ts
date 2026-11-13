import { DomainError } from "./DomainError"

/**
 * Erro quando o cliente não é encontrado
 */
export class CustomerNotFoundError extends DomainError {
  readonly code = "CUSTOMER_NOT_FOUND"

  constructor(identifier?: string) {
    super(
      identifier
        ? `Cliente não encontrado: ${identifier}`
        : "Cliente não encontrado"
    )
  }
}

/**
 * Erro quando o telefone já está cadastrado para outro cliente
 */
export class DuplicatePhoneError extends DomainError {
  readonly code = "DUPLICATE_PHONE"

  constructor(phone?: string) {
    super(
      phone
        ? `O telefone ${phone} já está cadastrado para outro cliente`
        : "Este telefone já está cadastrado para outro cliente"
    )
  }
}

/**
 * Por que o nome que temos não serve para a agenda oficial:
 * - `no_letters`: não tem nenhuma letra (só emoji, ou é o telefone);
 * - `profile_name`: tem letras, mas veio do perfil do WhatsApp ("Sil", "Gi") e a
 *   cliente ainda não informou o nome dela.
 */
export type CustomerNameRequiredReason = "no_letters" | "profile_name"

/**
 * Erro quando o cliente ainda não tem nome de verdade e o agendamento iria para a
 * agenda oficial do salão, que cadastra o cliente por esse nome.
 *
 * A mensagem é a que a IA lê (o código não tem mensagem amigável no
 * ErrorPresenter): leva o customerId para a IA chamar updateCustomerName mesmo
 * quando o prompt não o trouxe.
 */
export class CustomerNameRequiredError extends DomainError {
  readonly code = "CUSTOMER_NAME_REQUIRED"

  constructor(
    customerId: string,
    operation: "create" | "reschedule" = "create",
    readonly reason: CustomerNameRequiredReason = "no_letters"
  ) {
    const [done, verb] = operation === "create" ? ["agendado", "agendar"] : ["alterado", "remarcar"]
    super(
      reason === "profile_name"
        ? `Nada foi ${done}. O nome que temos desta cliente veio do perfil do WhatsApp e não serve para o cadastro ` +
            `na agenda do salão. Antes de ${verb}, pergunte o nome completo dela (nome e sobrenome), ` +
            `chame updateCustomerName (customerId: ${customerId}) com o que ela responder ` +
            `e tente ${verb} de novo com os mesmos dados. NÃO chame updateCustomerName com o nome do perfil ` +
            `nem com um nome que ela não tenha escrito nesta conversa. Não peça data nem horário de novo.`
        : `Nada foi ${done}. A agenda do salão precisa do nome do cliente, e o nome que temos não tem letras. ` +
            `Antes de ${verb}, pergunte o nome do cliente, chame updateCustomerName (customerId: ${customerId}) ` +
            `e tente ${verb} de novo com os mesmos dados. Não peça data nem horário de novo.`
    )
  }
}

/**
 * Erro quando o cliente não pertence ao salão
 */
export class CustomerNotInSalonError extends DomainError {
  readonly code = "CUSTOMER_NOT_IN_SALON"

  constructor() {
    super("O cliente não pertence a este estabelecimento")
  }
}
