/**
 * BaseGoogleCalendarHandler - Classe base para handlers do Google Calendar
 *
 * Baseado no padrão BaseToolHandler do google-calendar-mcp-main
 * Adaptado para o contexto do MinhaAgendaAI com Vercel AI SDK
 *
 * Fornece:
 * - Error handling robusto para erros da API do Google
 * - Validação e normalização de datetime
 * - Logging padronizado
 * - Contexto de salão e cliente
 */

// ============================================================================
// Types
// ============================================================================

export interface HandlerResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
  googleSyncSuccess?: boolean
  googleSyncError?: string | null
}

export interface HandlerContext {
  salonId: string
  clientPhone: string
}

// ============================================================================
// Constantes de Validação ISO 8601
// ============================================================================

// Padrões do código de referência
const ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
const ISO_DATETIME_WITHOUT_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

// ============================================================================
// Funções de Validação (exportadas para uso nos schemas)
// ============================================================================

/**
 * Valida se a string é um datetime ISO 8601 válido (com ou sem timezone)
 */
export function isValidIsoDateTime(val: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(val) || ISO_DATETIME_WITHOUT_TZ.test(val)
}

/**
 * Valida se a string é uma data ISO ou datetime ISO 8601
 */
export function isValidIsoDateOrDateTime(val: string): boolean {
  return ISO_DATE_ONLY.test(val) || isValidIsoDateTime(val)
}

/**
 * Verifica se o datetime já tem timezone
 */
export function hasTimezoneInDatetime(datetime: string): boolean {
  return ISO_DATETIME_WITH_TZ.test(datetime)
}

// ============================================================================
// Classe Base
// ============================================================================

export abstract class BaseGoogleCalendarHandler<TInput, TOutput> {
  protected readonly salonId: string
  protected readonly clientPhone: string
  protected readonly sourceFile: string

  constructor(salonId: string, clientPhone: string, sourceFile: string) {
    this.salonId = salonId
    this.clientPhone = clientPhone
    this.sourceFile = sourceFile
  }

  /**
   * Método abstrato que cada handler deve implementar
   */
  abstract execute(input: TInput): Promise<TOutput>

  // ==========================================================================
  // Error Handling (baseado no código de referência)
  // ==========================================================================

  /**
   * Trata erros da API do Google Calendar de forma padronizada
   * Baseado em BaseToolHandler.handleGoogleApiError
   */
  protected handleGoogleApiError(error: unknown, context?: string): never {
    // Verifica se é um erro do tipo GaxiosError (da biblioteca googleapis)
    // usando duck typing para evitar dependência direta
    if (this.isGaxiosError(error)) {
      const status = error.response?.status
      const errorData = error.response?.data as Record<string, unknown> | undefined

      // Handle invalid_grant (token revogado)
      if (errorData?.error === "invalid_grant") {
        throw new Error(
          "Token de autenticação inválido ou expirado. " +
            "Por favor, reconecte o Google Calendar nas configurações."
        )
      }

      // Handle specific HTTP status codes
      if (status === 400) {
        const errorMessage = this.extractErrorMessage(errorData) || "Requisição inválida"
        const errorDetails = this.extractErrorDetails(errorData)
        if (errorDetails) {
          throw new Error(`Erro na requisição: ${errorMessage}. Detalhes: ${errorDetails}`)
        }
        throw new Error(`Erro na requisição: ${errorMessage}`)
      }

      if (status === 401) {
        throw new Error(
          "Não autorizado. O token de acesso expirou ou foi revogado. " +
            "Por favor, reconecte o Google Calendar."
        )
      }

      if (status === 403) {
        const errorMessage = this.extractErrorMessage(errorData) || "Permissão negada"
        throw new Error(`Acesso negado: ${errorMessage}`)
      }

      if (status === 404) {
        const errorMessage = this.extractErrorMessage(errorData) || "Recurso não encontrado"
        throw new Error(`Não encontrado: ${errorMessage}`)
      }

      if (status === 429) {
        throw new Error(
          "Limite de requisições excedido. Por favor, aguarde alguns segundos e tente novamente."
        )
      }

      if (status && status >= 500) {
        throw new Error(
          `Erro no servidor do Google Calendar (${status}). Por favor, tente novamente em alguns minutos.`
        )
      }

      // Generic Google API error
      const errorMessage = this.extractErrorMessage(errorData) || error.message
      throw new Error(`Erro na API do Google Calendar: ${errorMessage}`)
    }

    // Non-Google API errors
    if (error instanceof Error) {
      throw new Error(`Erro${context ? ` em ${context}` : ""}: ${error.message}`)
    }

    throw new Error(`Erro desconhecido${context ? ` em ${context}` : ""}`)
  }

  /**
   * Verifica se o erro é do tipo GaxiosError usando duck typing
   */
  private isGaxiosError(error: unknown): error is { response?: { status?: number; data?: unknown }; message: string } {
    return (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as Record<string, unknown>).response === "object"
    )
  }

  /**
   * Extrai mensagem de erro do objeto de erro do Google
   */
  private extractErrorMessage(errorData: Record<string, unknown> | undefined): string | undefined {
    if (!errorData) return undefined
    const errorObj = errorData.error as Record<string, unknown> | undefined
    if (!errorObj) return undefined
    return errorObj.message as string | undefined
  }

  /**
   * Extrai detalhes de erro do objeto de erro do Google
   */
  private extractErrorDetails(errorData: Record<string, unknown> | undefined): string | undefined {
    if (!errorData) return undefined
    const errorObj = errorData.error as Record<string, unknown> | undefined
    if (!errorObj) return undefined
    const errors = errorObj.errors as Array<Record<string, unknown>> | undefined
    if (!Array.isArray(errors)) return undefined
    return errors.map((e) => (e.message || e.reason) as string).join("; ")
  }

  // ==========================================================================
  // DateTime Utilities
  // ==========================================================================

  /**
   * Normaliza datetime para incluir timezone se não tiver
   * Usa America/Sao_Paulo como padrão
   */
  protected normalizeDateTime(dateTime: string, timezone = "America/Sao_Paulo"): string {
    if (!dateTime) return dateTime

    // Se já tem timezone, retorna como está
    if (hasTimezoneInDatetime(dateTime)) {
      return dateTime
    }

    // Se é datetime sem timezone, adiciona o offset de São Paulo (-03:00)
    if (ISO_DATETIME_WITHOUT_TZ.test(dateTime)) {
      return `${dateTime}-03:00`
    }

    // Se é só data, converte para datetime com início do dia
    if (ISO_DATE_ONLY.test(dateTime)) {
      return `${dateTime}T00:00:00-03:00`
    }

    return dateTime
  }

  /**
   * Extrai apenas a parte da data de um datetime
   */
  protected extractDateOnly(dateTime: string): string {
    return dateTime.slice(0, 10)
  }

  /**
   * Cria objeto Date a partir de datetime normalizado
   */
  protected parseDateTime(dateTime: string): Date {
    const normalized = this.normalizeDateTime(dateTime)
    return new Date(normalized)
  }

  // ==========================================================================
  // Logging
  // ==========================================================================

  /**
   * Log de execução da tool (para debugging)
   */
  protected logExecution(
    toolName: string,
    params: unknown,
    result: unknown,
    startTime: number
  ): void {
    const duration = Date.now() - startTime
    console.log("\n🔨 [Tool Execution] " + toolName)
    console.log(`   📁 Arquivo: ${this.sourceFile}`)
    console.log(
      `   📥 Parâmetros: ${JSON.stringify(params, null, 2)
        .split("\n")
        .join("\n      ")}`
    )
    console.log(
      `   📤 Resposta: ${JSON.stringify(result, null, 2)
        .split("\n")
        .join("\n      ")}`
    )
    console.log(`   ⏱️ Duração: ${duration}ms`)
    console.log("")
  }

  /**
   * Log de warning
   */
  protected logWarning(message: string, data?: unknown): void {
    console.warn(`⚠️ [${this.constructor.name}] ${message}`, data || "")
  }

  /**
   * Log de erro
   */
  protected logError(message: string, data?: unknown): void {
    console.error(`❌ [${this.constructor.name}] ${message}`, data || "")
  }
}
