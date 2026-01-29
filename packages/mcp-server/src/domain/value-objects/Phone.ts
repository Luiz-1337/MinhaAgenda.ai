import { Result, ok, fail } from "../../shared/types"
import { InvalidPhoneError } from "../errors"
import {
  normalizePhone,
  formatPhone,
  isValidPhone,
} from "../../shared/utils/phone.utils"

/**
 * Value Object imutável que representa um telefone válido
 */
export class Phone {
  private constructor(private readonly value: string) {}

  /**
   * Cria uma instância de Phone validando o formato
   */
  static create(phone: string): Result<Phone, InvalidPhoneError> {
    if (!phone || phone.trim() === "") {
      return fail(new InvalidPhoneError("Telefone não pode estar vazio"))
    }

    const normalized = normalizePhone(phone)

    if (!isValidPhone(normalized)) {
      return fail(new InvalidPhoneError(phone))
    }

    return ok(new Phone(normalized))
  }

  /**
   * Cria uma instância sem validação (usar apenas para dados já validados do banco)
   */
  static fromPersistence(phone: string): Phone {
    return new Phone(normalizePhone(phone))
  }

  /**
   * Retorna o telefone formatado para exibição
   */
  format(): string {
    return formatPhone(this.value)
  }

  /**
   * Retorna o telefone normalizado (apenas dígitos)
   */
  normalize(): string {
    return this.value
  }

  /**
   * Retorna o valor para persistência
   */
  toPersistence(): string {
    return this.value
  }

  /**
   * Compara igualdade com outro Phone
   */
  equals(other: Phone): boolean {
    return this.value === other.value
  }

  /**
   * Retorna representação em string
   */
  toString(): string {
    return this.format()
  }
}
