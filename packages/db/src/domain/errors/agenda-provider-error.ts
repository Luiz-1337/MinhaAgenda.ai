import { IntegrationError } from './integration-error'

/**
 * Como uma chamada à agenda externa falhou. É o que decide o que fazer com a
 * reserva local, então cada provedor TEM que traduzir os erros da sua API para
 * um destes — nunca deixar vazar um erro cru de fetch.
 *
 * - `slot_unavailable` — a agenda externa recusou o horário (ocupado).
 * - `rejected`         — recusou por outro motivo de negócio/validação.
 * - `auth`             — credencial inválida, expirada ou sem permissão.
 * - `not_found`        — o recurso externo (ex.: o agendamento) não existe.
 * - `unavailable`      — não deu para falar com a API, e com certeza NADA foi
 *                        gravado (falha de conexão antes de enviar, 5xx em leitura).
 * - `uncertain`        — a escrita foi enviada e não houve resposta (timeout,
 *                        conexão caída no meio): pode ter gravado do lado de lá.
 */
export type AgendaProviderErrorKind =
  | 'slot_unavailable'
  | 'rejected'
  | 'auth'
  | 'not_found'
  | 'unavailable'
  | 'uncertain'

export class AgendaProviderError extends IntegrationError {
  constructor(
    message: string,
    provider: string,
    public readonly kind: AgendaProviderErrorKind,
    context?: Record<string, unknown>
  ) {
    super(message, provider, { ...context, kind })
    this.name = 'AgendaProviderError'
    Object.setPrototypeOf(this, AgendaProviderError.prototype)
  }
}

export function isAgendaProviderError(error: unknown): error is AgendaProviderError {
  return error instanceof AgendaProviderError
}
