import { Result, ok, fail } from "../../shared/types"
import { InvalidEmailError } from "../errors"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Value Object imutável que representa um email válido
 */
export class Email {
  private constructor(private readonly value: string) {}

  /**
   * Cria uma instância de Email validando o formato
   */
  static create(email: string): Result<Email, InvalidEmailError> {
    if (!email || email.trim() === "") {
      return fail(new InvalidEmailError("Email não pode estar vazio"))
    }

    const normalized = email.trim().toLowerCase()

    if (!EMAIL_REGEX.test(normalized)) {
      return fail(new InvalidEmailError(email))
    }

    return ok(new Email(normalized))
  }

  /**
   * Cria uma instância sem validação (usar apenas para dados já validados do banco)
   */
  static fromPersistence(email: string): Email {
    return new Email(email.toLowerCase())
  }

  /**
   * Retorna o email formatado para exibição
   */
  format(): string {
    return this.value
  }

  /**
   * Retorna o valor para persistência
   */
  toPersistence(): string {
    return this.value
  }

  /**
   * Compara igualdade com outro Email
   */
  equals(other: Email): boolean {
    return this.value === other.value
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    return this.value
  }
}
