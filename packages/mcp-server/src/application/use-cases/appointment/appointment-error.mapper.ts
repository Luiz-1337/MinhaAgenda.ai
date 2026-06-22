import {
  DomainError,
  AppointmentNotFoundError,
  AppointmentConflictError,
  PastAppointmentError,
  AppointmentOperationError,
  ProfessionalCannotPerformServiceError,
  ProfessionalNotAvailableError,
} from "../../../domain/errors"

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
      return new AppointmentOperationError(message)
  }
}
