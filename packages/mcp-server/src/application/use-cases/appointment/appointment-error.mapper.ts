import {
  DomainError,
  AppointmentNotFoundError,
  AppointmentConflictError,
  PastAppointmentError,
  AppointmentOperationError,
  ProfessionalCannotPerformServiceError,
  ProfessionalNotAvailableError,
  ExternalAgendaConflictError,
  ExternalAgendaUnavailableError,
  ExternalAgendaNotLinkedError,
  ExternalAgendaRejectedError,
} from "../../../domain/errors"

/**
 * Erros da agenda OFICIAL externa (ex.: Belasis), que o createAppointmentService
 * e o updateAppointmentService devolvem quando a gravação lá falha. Devolve
 * `null` para qualquer outro código, para quem chama decidir o fallback.
 *
 * Antes, no agendamento, todos viravam "Não foi possível criar o agendamento.
 * Verifique os dados e tente novamente." e a IA pedia de novo data e horário
 * que estavam certos (visto em 03/nov/2026, com a agenda oficial fora do ar).
 */
export function mapExternalAgendaError(
  code: string | undefined,
  message: string
): DomainError | null {
  switch (code) {
    case "EXTERNAL_AGENDA_CONFLICT":
      return new ExternalAgendaConflictError(message)
    case "EXTERNAL_AGENDA_UNAVAILABLE":
      return new ExternalAgendaUnavailableError(message)
    case "EXTERNAL_AGENDA_NOT_LINKED":
      return new ExternalAgendaNotLinkedError(message)
    case "EXTERNAL_AGENDA_REJECTED":
      return new ExternalAgendaRejectedError(message)
    default:
      return null
  }
}

/**
 * Converte o erro retornado pelos domain services (@repo/db) — um par
 * `{ error, code }` — no DomainError de apresentação correto.
 *
 * Antes (bug A2), QUALQUER falha do serviço era envolvida em
 * `AppointmentNotFoundError`, fazendo a IA receber "agendamento não encontrado"
 * mesmo quando o problema era outro (ex.: profissional não executa o serviço).
 *
 * Quando o código não é reconhecido, usa `AppointmentOperationError`, cujo
 * código não tem mensagem amigável no ErrorPresenter — então a mensagem REAL do
 * serviço é repassada à IA, em vez de ser mascarada.
 */
export function mapServiceError(code: string | undefined, message: string): DomainError {
  switch (code) {
    case "APPOINTMENT_NOT_FOUND":
      return new AppointmentNotFoundError()
    case "APPOINTMENT_CONFLICT":
      return new AppointmentConflictError(message)
    case "PAST_APPOINTMENT":
      return new PastAppointmentError(message)
    case "PROFESSIONAL_CANNOT_PERFORM_SERVICE":
      return new ProfessionalCannotPerformServiceError()
    case "PROFESSIONAL_NOT_AVAILABLE":
      return new ProfessionalNotAvailableError(message)
    default:
      return mapExternalAgendaError(code, message) ?? new AppointmentOperationError(message)
  }
}
