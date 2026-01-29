import { DomainError } from "./DomainError"

/**
 * Erro quando o horário solicitado não está disponível
 */
export class SlotUnavailableError extends DomainError {
  readonly code = "SLOT_UNAVAILABLE"

  constructor(message = "O horário solicitado não está disponível") {
    super(message)
  }
}

/**
 * Erro quando há conflito com outro agendamento
 */
export class AppointmentConflictError extends DomainError {
  readonly code = "APPOINTMENT_CONFLICT"

  constructor(
    message = "Já existe um agendamento neste horário"
  ) {
    super(message)
  }
}

/**
 * Erro quando tenta modificar um agendamento passado
 */
export class PastAppointmentError extends DomainError {
  readonly code = "PAST_APPOINTMENT"

  constructor(message = "Não é possível modificar um agendamento passado") {
    super(message)
  }
}

/**
 * Erro quando o agendamento não é encontrado
 */
export class AppointmentNotFoundError extends DomainError {
  readonly code = "APPOINTMENT_NOT_FOUND"

  constructor(appointmentId?: string) {
    super(
      appointmentId
        ? `Agendamento ${appointmentId} não encontrado`
        : "Agendamento não encontrado"
    )
  }
}

/**
 * Erro quando o serviço não está disponível para agendamento
 */
export class ServiceNotBookableError extends DomainError {
  readonly code = "SERVICE_NOT_BOOKABLE"

  constructor(serviceName?: string) {
    super(
      serviceName
        ? `O serviço "${serviceName}" não está disponível para agendamento`
        : "O serviço não está disponível para agendamento"
    )
  }
}

/**
 * Erro quando o profissional não realiza o serviço solicitado
 */
export class ProfessionalCannotPerformServiceError extends DomainError {
  readonly code = "PROFESSIONAL_CANNOT_PERFORM_SERVICE"

  constructor(professionalName?: string, serviceName?: string) {
    const msg =
      professionalName && serviceName
        ? `O profissional "${professionalName}" não realiza o serviço "${serviceName}"`
        : "O profissional não realiza este serviço"
    super(msg)
  }
}

/**
 * Erro quando o profissional não está disponível
 */
export class ProfessionalNotAvailableError extends DomainError {
  readonly code = "PROFESSIONAL_NOT_AVAILABLE"

  constructor(message = "O profissional não está disponível neste horário") {
    super(message)
  }
}
