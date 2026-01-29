import { DomainError } from "./DomainError"

/**
 * Erro de telefone inválido
 */
export class InvalidPhoneError extends DomainError {
  readonly code = "INVALID_PHONE"

  constructor(phone?: string) {
    super(
      phone
        ? `Telefone inválido: ${phone}`
        : "O telefone informado é inválido"
    )
  }
}

/**
 * Erro de data inválida
 */
export class InvalidDateError extends DomainError {
  readonly code = "INVALID_DATE"

  constructor(date?: string) {
    super(
      date
        ? `Data inválida: ${date}`
        : "A data informada é inválida"
    )
  }
}

/**
 * Erro de campo obrigatório
 */
export class RequiredFieldError extends DomainError {
  readonly code = "REQUIRED_FIELD"

  constructor(fieldName: string) {
    super(`O campo "${fieldName}" é obrigatório`)
  }
}

/**
 * Erro de email inválido
 */
export class InvalidEmailError extends DomainError {
  readonly code = "INVALID_EMAIL"

  constructor(email?: string) {
    super(
      email
        ? `Email inválido: ${email}`
        : "O email informado é inválido"
    )
  }
}

/**
 * Erro de UUID inválido
 */
export class InvalidUUIDError extends DomainError {
  readonly code = "INVALID_UUID"

  constructor(fieldName: string, value?: string) {
    super(
      value
        ? `${fieldName} inválido: ${value} não é um UUID válido`
        : `${fieldName} deve ser um UUID válido`
    )
  }
}

/**
 * Erro de valor fora do intervalo permitido
 */
export class OutOfRangeError extends DomainError {
  readonly code = "OUT_OF_RANGE"

  constructor(fieldName: string, min?: number, max?: number) {
    let message = `O valor de "${fieldName}" está fora do intervalo permitido`
    if (min !== undefined && max !== undefined) {
      message = `O valor de "${fieldName}" deve estar entre ${min} e ${max}`
    } else if (min !== undefined) {
      message = `O valor de "${fieldName}" deve ser maior ou igual a ${min}`
    } else if (max !== undefined) {
      message = `O valor de "${fieldName}" deve ser menor ou igual a ${max}`
    }
    super(message)
  }
}
