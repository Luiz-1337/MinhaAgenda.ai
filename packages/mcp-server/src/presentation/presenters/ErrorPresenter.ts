import { DomainError } from "../../domain/errors"

/**
 * Mensagens amigáveis para erros de domínio
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Erros de Agendamento
  SLOT_UNAVAILABLE:
    "Desculpe, esse horário não está mais disponível. Posso sugerir outros horários?",
  APPOINTMENT_CREATION_FAILED:
    "Não foi possível criar o agendamento. Verifique os dados e tente novamente.",
  APPOINTMENT_CONFLICT:
    "Já existe um agendamento neste horário. Gostaria de ver outros horários disponíveis?",
  PAST_APPOINTMENT:
    "Não é possível modificar agendamentos passados.",
  APPOINTMENT_NOT_FOUND:
    "Não encontrei esse agendamento. Pode verificar se o ID está correto?",
  SERVICE_NOT_BOOKABLE:
    "Este serviço não está disponível para agendamento no momento.",
  PROFESSIONAL_CANNOT_PERFORM_SERVICE:
    "Este profissional não realiza o serviço selecionado. Posso sugerir outro profissional?",
  PROFESSIONAL_NOT_AVAILABLE:
    "O profissional não está disponível neste horário. Posso verificar outros horários?",

  // Erros de Cliente
  CUSTOMER_NOT_FOUND:
    "Não encontrei seu cadastro. Pode me informar seu nome para te cadastrar?",
  DUPLICATE_PHONE:
    "Este telefone já está cadastrado. Deseja atualizar os dados?",
  CUSTOMER_NOT_IN_SALON:
    "Você ainda não está cadastrado neste estabelecimento.",

  // Erros de Validação
  INVALID_PHONE:
    "O número de telefone informado não parece válido. Pode verificar?",
  INVALID_DATE:
    "A data informada não é válida. Use o formato DD/MM/AAAA.",
  REQUIRED_FIELD:
    "Alguns campos obrigatórios não foram preenchidos.",
  INVALID_EMAIL:
    "O email informado não parece válido. Pode verificar?",
  INVALID_UUID:
    "O identificador informado não é válido.",
  OUT_OF_RANGE:
    "O valor informado está fora do permitido.",
}

/**
 * Presenter para formatação de erros
 */
export class ErrorPresenter {
  /**
   * Formata um erro de domínio para mensagem amigável
   */
  static format(error: DomainError | Error): string {
    if ("code" in error) {
      const domainError = error as DomainError
      const friendlyMessage = ERROR_MESSAGES[domainError.code]
      if (friendlyMessage) {
        return friendlyMessage
      }
    }

    // Fallback para mensagem do erro
    return error.message || "Ocorreu um erro inesperado. Pode tentar novamente?"
  }

  /**
   * Formata erro para JSON
   */
  static toJSON(error: DomainError | Error): Record<string, unknown> {
    const code = "code" in error ? (error as DomainError).code : "UNKNOWN_ERROR"

    return {
      error: true,
      code,
      message: this.format(error),
      details: error.message,
    }
  }

  /**
   * Verifica se é um erro de domínio conhecido
   */
  static isKnownError(error: unknown): error is DomainError {
    return (
      error instanceof Error &&
      "code" in error &&
      typeof (error as DomainError).code === "string"
    )
  }

  /**
   * Formata erro com sugestão de ação
   */
  static formatWithSuggestion(error: DomainError | Error): string {
    const message = this.format(error)

    // Adiciona sugestões baseadas no tipo de erro
    if ("code" in error) {
      const code = (error as DomainError).code

      switch (code) {
        case "SLOT_UNAVAILABLE":
        case "APPOINTMENT_CONFLICT":
          return `${message}\n\nUse a ferramenta checkAvailability para ver horários disponíveis.`

        case "CUSTOMER_NOT_FOUND":
          return `${message}\n\nUse a ferramenta identifyCustomer com o nome para cadastrar.`

        case "APPOINTMENT_NOT_FOUND":
          return `${message}\n\nUse getMyFutureAppointments para listar seus agendamentos.`
      }
    }

    return message
  }
}
