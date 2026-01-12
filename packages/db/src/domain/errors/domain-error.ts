/**
 * Base domain error class
 */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: unknown
  ) {
    super(message)
    this.name = 'DomainError'
    Object.setPrototypeOf(this, DomainError.prototype)
  }
}
