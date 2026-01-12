/**
 * Logger abstraction for dependency inversion
 * Follows DIP (Dependency Inversion Principle)
 */

export interface ILogger {
  debug(message: string, meta?: unknown): void
  info(message: string, meta?: unknown): void
  warn(message: string, meta?: unknown): void
  error(message: string, meta?: unknown, error?: Error): void
}

/**
 * Console logger implementation for development
 */
export class ConsoleLogger implements ILogger {
  debug(message: string, meta?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta ? meta : '')
    }
  }

  info(message: string, meta?: unknown): void {
    console.info(`[INFO] ${message}`, meta ? meta : '')
  }

  warn(message: string, meta?: unknown): void {
    console.warn(`[WARN] ${message}`, meta ? meta : '')
  }

  error(message: string, meta?: unknown, error?: Error): void {
    console.error(`[ERROR] ${message}`, meta ? meta : '', error ? error : '')
  }
}

/**
 * Null logger implementation for production (silent)
 */
export class NullLogger implements ILogger {
  debug(_message: string, _meta?: unknown): void {
    // Silent in production
  }

  info(_message: string, _meta?: unknown): void {
    // Silent in production
  }

  warn(_message: string, _meta?: unknown): void {
    // Silent in production
  }

  error(_message: string, _meta?: unknown, _error?: Error): void {
    // Silent in production - consider using proper error tracking service
  }
}

/**
 * Logger factory - chooses implementation based on environment
 */
export class LoggerFactory {
  private static instance: ILogger | null = null

  static create(): ILogger {
    if (this.instance === null) {
      this.instance =
        process.env.NODE_ENV === 'production' ? new NullLogger() : new ConsoleLogger()
    }
    return this.instance
  }

  static setLogger(logger: ILogger): void {
    this.instance = logger
  }
}

/**
 * Default logger instance
 */
export const logger = LoggerFactory.create()
