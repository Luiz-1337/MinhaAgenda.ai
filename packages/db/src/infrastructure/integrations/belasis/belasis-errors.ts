import {
  AgendaProviderError,
  type AgendaProviderErrorKind,
} from '../../../domain/errors/agenda-provider-error'

/**
 * Erro de uma chamada à API Belasis, já com o `kind` que a orquestração da agenda
 * oficial entende. `messages` é o corpo dos 422 (a API devolve um array de
 * strings, ex.: ["Celular já está em uso"]).
 *
 * A mensagem NUNCA leva o token nem dados do cliente: vai para log e alerta.
 */
export class BelasisApiError extends AgendaProviderError {
  constructor(
    message: string,
    kind: AgendaProviderErrorKind,
    public readonly detail: {
      method: string
      path: string
      httpStatus?: number
      messages?: string[]
    }
  ) {
    super(message, 'belasis', kind, detail)
    this.name = 'BelasisApiError'
    Object.setPrototypeOf(this, BelasisApiError.prototype)
  }

  get httpStatus(): number | undefined {
    return this.detail.httpStatus
  }

  get messages(): string[] {
    return this.detail.messages ?? []
  }
}

export function isBelasisApiError(error: unknown): error is BelasisApiError {
  return error instanceof BelasisApiError
}
