/**
 * Logger estruturado com níveis configuráveis via LOG_LEVEL
 * 
 * Níveis disponíveis (em ordem de prioridade):
 * - debug: logs de desenvolvimento (mais verboso)
 * - info: informações gerais
 * - warn: avisos
 * - error: erros (menos verboso)
 * 
 * Em produção (NODE_ENV=production):
 * - Default: warn (loga warn e error)
 * - Erros NUNCA são silenciados
 * 
 * Em desenvolvimento:
 * - Default: debug (loga tudo)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface ILogger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown, error?: Error): void
  child(context: Record<string, unknown>): ILogger
}

/**
 * Determina o nível de log baseado em variáveis de ambiente
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel
  }
  
  // Default: warn em produção, debug em desenvolvimento
  return process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
}

/**
 * Formata timestamp no padrão ISO
 */
function getTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Formata mensagem de log com contexto
 */
function formatMessage(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  meta?: unknown
): string {
  const parts = [`[${getTimestamp()}]`, `[${level.toUpperCase()}]`, message]
  
  if (context && Object.keys(context).length > 0) {
    parts.push(`context=${JSON.stringify(context)}`)
  }
  
  if (meta !== undefined) {
    if (typeof meta === 'object' && meta !== null) {
      parts.push(`meta=${JSON.stringify(meta)}`)
    } else {
      parts.push(`meta=${String(meta)}`)
    }
  }
  
  return parts.join(' ')
}

/**
 * Logger com níveis configuráveis e suporte a contexto
 */
export class StructuredLogger implements ILogger {
  private readonly minLevel: number
  private readonly context: Record<string, unknown>

  constructor(context: Record<string, unknown> = {}) {
    this.minLevel = LOG_LEVELS[getLogLevel()]
    this.context = context
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.minLevel
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog('debug')) {
      console.debug(formatMessage('debug', message, this.context, meta))
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(formatMessage('info', message, this.context, meta))
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(formatMessage('warn', message, this.context, meta))
    }
  }

  error(message: string, meta?: unknown, error?: Error): void {
    // Erros SEMPRE são logados, independente do nível configurado
    const formattedMessage = formatMessage('error', message, this.context, meta)
    if (error) {
      console.error(formattedMessage, {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
      })
    } else {
      console.error(formattedMessage)
    }
  }

  /**
   * Cria um logger filho com contexto adicional
   * Útil para adicionar salonId, appointmentId, etc.
   * 
   * @example
   * const childLogger = logger.child({ salonId: '123', operation: 'createAppointment' })
   * childLogger.info('Processing request') // Inclui salonId e operation no log
   */
  child(additionalContext: Record<string, unknown>): ILogger {
    return new StructuredLogger({ ...this.context, ...additionalContext })
  }
}

/**
 * Logger factory - mantido para compatibilidade
 */
export class LoggerFactory {
  private static instance: ILogger | null = null

  static create(): ILogger {
    if (this.instance === null) {
      this.instance = new StructuredLogger()
    }
    return this.instance
  }

  static setLogger(logger: ILogger): void {
    this.instance = logger
  }

  /**
   * Cria um logger com contexto específico (não afeta o singleton global)
   */
  static createWithContext(context: Record<string, unknown>): ILogger {
    return new StructuredLogger(context)
  }
}

// Re-export classes antigas como aliases para compatibilidade
export const ConsoleLogger = StructuredLogger
export const NullLogger = StructuredLogger

/**
 * Default logger instance
 */
export const logger = LoggerFactory.create()
