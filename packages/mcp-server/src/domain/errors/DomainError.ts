/**
 * Classe base abstrata para todos os erros de domínio
 * Permite tratamento uniforme de erros de negócio
 */
export abstract class DomainError extends Error {
  /** Código único para identificação programática do erro */
  abstract readonly code: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    // Mantém o stack trace correto para V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}
