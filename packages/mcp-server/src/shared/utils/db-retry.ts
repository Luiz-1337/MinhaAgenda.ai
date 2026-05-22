/**
 * Retry com backoff exponencial para queries de banco.
 *
 * Foco em erros TRANSITÓRIOS — conexão dropada pelo PgBouncer, timeout no servidor,
 * pool saturado, restart do Supabase. Erros lógicos (constraint violation, syntax
 * error) NÃO são retried — o retry só piora a situação nesses casos.
 *
 * Não usa nenhum logger externo (mantém o pacote isolado). Se quiser logar, passe
 * `onRetry` nas opções.
 */

export interface DbRetryOptions {
  /** Número máximo de tentativas (padrão: 3) */
  maxAttempts?: number
  /** Delay inicial em ms (padrão: 100) */
  initialDelayMs?: number
  /** Fator de multiplicação do delay (padrão: 2) */
  backoffFactor?: number
  /** Delay máximo em ms (padrão: 2000) */
  maxDelayMs?: number
  /** Nome da operação para diagnóstico */
  operationName?: string
  /** Callback chamado antes de cada retry (não bloqueante) */
  onRetry?: (info: {
    attempt: number
    delayMs: number
    error: unknown
    operationName?: string
  }) => void
}

/**
 * Códigos SQLSTATE do PostgreSQL que indicam erro transitório.
 * Ref: https://www.postgresql.org/docs/current/errcodes-appendix.html
 *
 * - 08xxx — Connection Exception (08000, 08003, 08006, 08001, 08004, 08007)
 * - 57P01 — admin_shutdown (Supabase restart)
 * - 57P02 — crash_shutdown
 * - 57P03 — cannot_connect_now
 * - 57014 — query_canceled (statement_timeout disparado)
 * - 53300 — too_many_connections
 * - 53400 — configuration_limit_exceeded
 * - 40001 — serialization_failure
 * - 40P01 — deadlock_detected
 */
const TRANSIENT_SQLSTATES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "57P01",
  "57P02",
  "57P03",
  "57014",
  "53300",
  "53400",
  "40001",
  "40P01",
])

/**
 * Códigos de erro de rede Node.js (em err.code) que indicam falha transitória.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
  "ECONNABORTED",
  "ECONNREFUSED",
])

/**
 * Padrões de mensagem que indicam erro transitório (fallback quando não há código).
 * postgres-js às vezes vem com `message: "Failed query: ..."` sem `code`.
 */
const TRANSIENT_MESSAGE_PATTERNS: RegExp[] = [
  /failed query/i,
  /connection terminated/i,
  /terminating connection/i,
  /connection closed/i,
  /server closed the connection/i,
  /\btimeout\b/i,
  /too many (?:clients|connections)/i,
  /the database system is starting up/i,
  /the database system is shutting down/i,
]

export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false

  const err = error as { code?: unknown; message?: unknown; cause?: unknown; severity?: unknown }

  if (typeof err.code === "string") {
    if (TRANSIENT_SQLSTATES.has(err.code)) return true
    if (TRANSIENT_NETWORK_CODES.has(err.code)) return true
  }

  if (typeof err.message === "string") {
    for (const pattern of TRANSIENT_MESSAGE_PATTERNS) {
      if (pattern.test(err.message)) return true
    }
  }

  // Erros wrapped (ex: postgres-js encadeia um network error como `cause`).
  if (err.cause && err.cause !== err) {
    return isTransientDbError(err.cause)
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Executa uma operação de banco com retry e backoff exponencial em erros transitórios.
 *
 * Exemplo:
 * ```ts
 * const salon = await withDbRetry(
 *   () => db.query.salons.findFirst({ where: eq(salons.id, id) }),
 *   { operationName: "salons.findById" }
 * )
 * ```
 */
export async function withDbRetry<T>(
  fn: () => Promise<T>,
  options: DbRetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 100,
    backoffFactor = 2,
    maxDelayMs = 2000,
    operationName,
    onRetry,
  } = options

  let attempt = 0
  let delayMs = initialDelayMs
  let lastError: unknown

  while (attempt < maxAttempts) {
    attempt += 1
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const transient = isTransientDbError(error)
      const hasAttemptsLeft = attempt < maxAttempts

      if (!transient || !hasAttemptsLeft) {
        throw error
      }

      onRetry?.({ attempt, delayMs, error, operationName })
      await sleep(delayMs)
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs)
    }
  }

  throw lastError
}
