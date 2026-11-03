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
 * Erro quando o cliente ainda não tem nome de verdade (o do WhatsApp era só
 * emoji, ou é o telefone) e o agendamento iria para a agenda oficial do salão,
 * que cadastra o cliente por esse nome e não deixa corrigir depois.
 *
 * A mensagem é a que a IA lê (o código não tem mensagem amigável no
 * ErrorPresenter): leva o customerId para a IA chamar updateCustomerName mesmo
 * quando o prompt não o trouxe.
 */
export class CustomerNameRequiredError extends DomainError {
  readonly code = "CUSTOMER_NAME_REQUIRED"

  constructor(customerId: string, operation: "create" | "reschedule" = "create") {
    const [done, verb] = operation === "create" ? ["agendado", "agendar"] : ["alterado", "remarcar"]
    super(
      `Nada foi ${done}. A agenda do salão precisa do nome do cliente, e o nome que temos não tem letras. ` +
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
