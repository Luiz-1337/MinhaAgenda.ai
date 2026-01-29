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
 * Erro quando o cliente não pertence ao salão
 */
export class CustomerNotInSalonError extends DomainError {
  readonly code = "CUSTOMER_NOT_IN_SALON"

  constructor() {
    super("O cliente não pertence a este estabelecimento")
  }
}
