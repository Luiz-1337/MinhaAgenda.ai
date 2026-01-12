import { DomainError } from './domain-error'

/**
 * Integration-specific error
 */
export class IntegrationError extends DomainError {
  constructor(
    message: string,
    public readonly provider: string,
    context?: unknown
  ) {
    const contextObj =
      context && typeof context === 'object' && !Array.isArray(context)
        ? { ...context, provider }
        : { provider, ...(context !== undefined ? { context } : {}) }
    super(message, 'INTEGRATION_ERROR', contextObj)
    this.name = 'IntegrationError'
    Object.setPrototypeOf(this, IntegrationError.prototype)
  }
}
