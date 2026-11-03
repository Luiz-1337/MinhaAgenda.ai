import { DomainError } from "../../domain/errors"

const CHECK_AVAILABILITY_HINT = "Use a ferramenta checkAvailability para ver horários disponíveis."

/**
 * Horário ocupado, seja aqui, no Google Calendar ou na agenda oficial do salão.
 * Antes o conflito local dizia "Já existe um agendamento neste horário", que
 * pode ser lido como o agendamento do próprio cliente.
 */
const SLOT_TAKEN_MESSAGE =
  `Desculpe, esse horário não está mais disponível. Posso sugerir outros horários?\n\n${CHECK_AVAILABILITY_HINT}`

/**
 * Mensagens amigáveis para erros de domínio
 *
 * PAST_APPOINTMENT e SERVICE_RULE_VIOLATION ficam de fora de propósito: a
 * mensagem do próprio erro já é a certa ("Não é possível agendar em um horário
 * que já passou", "Este serviço só é realizado em: Ter, Qui.") e vai inteira
 * para a IA. Uma frase única aqui trocaria o motivo por outro.
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Erros de Agendamento
  SLOT_UNAVAILABLE: SLOT_TAKEN_MESSAGE,
  APPOINTMENT_CREATION_FAILED:
    "Não foi possível criar o agendamento. Verifique os dados e tente novamente.",
  APPOINTMENT_CONFLICT: SLOT_TAKEN_MESSAGE,
  APPOINTMENT_NOT_FOUND:
    "Não encontrei esse agendamento. Pode verificar se o ID está correto?",
  SERVICE_NOT_BOOKABLE:
    "Este serviço não está disponível para agendamento no momento.",
  PROFESSIONAL_CANNOT_PERFORM_SERVICE:
    "Este profissional não realiza o serviço selecionado. Posso sugerir outro profissional?",
  PROFESSIONAL_NOT_AVAILABLE:
    `O profissional não está disponível neste horário. Posso verificar outros horários?\n\n${CHECK_AVAILABILITY_HINT}`,

  // Erros da agenda oficial do salão (ex.: Belasis). Nos quatro, nada foi
  // agendado nem alterado. A IA decide a resposta a partir daqui: sem o motivo,
  // ela pede de novo data e horário que estavam certos.
  EXTERNAL_AGENDA_CONFLICT: SLOT_TAKEN_MESSAGE,
  EXTERNAL_AGENDA_UNAVAILABLE:
    "Não consegui confirmar na agenda do salão agora, então nada foi agendado nem alterado. " +
    "O problema é no sistema do salão, não nos dados: não peça data, horário ou serviço de novo. " +
    "Avise o cliente e ofereça tentar de novo em alguns minutos; se continuar falhando, oriente-o a falar com a equipe do salão.",
  EXTERNAL_AGENDA_NOT_LINKED:
    "Este profissional ou serviço não pode ser agendado por aqui: ainda não está vinculado à agenda do salão " +
    "(o campo details diz qual dos dois). Nada foi agendado nem alterado, e trocar o horário não resolve. " +
    "Se for o profissional, ofereça outro que faça o serviço; se for o serviço, oriente o cliente a falar com a equipe do salão.",
  EXTERNAL_AGENDA_REJECTED:
    "A agenda do salão recusou este agendamento, então ele não pode ser feito por aqui. Nada foi agendado nem alterado. " +
    "Não peça os dados de novo: oriente o cliente a falar com a equipe do salão para concluir.",

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
 * Códigos cuja mensagem (acima, ou a do próprio erro) já diz à IA o motivo e o
 * que responder ao cliente. Quem envia a resposta (apps/web) não deve trocá-la
 * por um texto pronto: o texto pronto de agendamento pede data e horário de
 * novo, o que não ajuda quando o horário está só ocupado ou fora do expediente.
 * Ficam com o texto pronto os erros de dado inválido (APPOINTMENT_CREATION_FAILED)
 * e os inesperados.
 */
export const AI_GUIDED_ERROR_CODES: ReadonlySet<string> = new Set([
  "SLOT_UNAVAILABLE",
  "APPOINTMENT_CONFLICT",
  "PROFESSIONAL_NOT_AVAILABLE",
  "PROFESSIONAL_CANNOT_PERFORM_SERVICE",
  "PAST_APPOINTMENT",
  "SERVICE_RULE_VIOLATION",
  "EXTERNAL_AGENDA_CONFLICT",
  "EXTERNAL_AGENDA_UNAVAILABLE",
  "EXTERNAL_AGENDA_NOT_LINKED",
  "EXTERNAL_AGENDA_REJECTED",
])

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

      // Horário ocupado já traz a dica de checkAvailability na própria mensagem.
      switch (code) {
        case "CUSTOMER_NOT_FOUND":
          return `${message}\n\nUse a ferramenta identifyCustomer com o nome para cadastrar.`

        case "APPOINTMENT_NOT_FOUND":
          return `${message}\n\nUse getMyFutureAppointments para listar seus agendamentos.`
      }
    }

    return message
  }
}
