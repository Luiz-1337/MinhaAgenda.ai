/**
 * Result Pattern para tratamento de erros sem exceções
 * Torna erros explícitos no sistema de tipos
 */

export type Success<T> = {
  success: true
  data: T
}

export type Failure<E> = {
  success: false
  error: E
}

export type Result<T, E = Error> = Success<T> | Failure<E>

/**
 * Cria um Result de sucesso
 */
export function ok<T>(data: T): Success<T> {
  return { success: true, data }
}

/**
 * Cria um Result de falha
 */
export function fail<E>(error: E): Failure<E> {
  return { success: false, error }
}

/**
 * Type guard para verificar se é sucesso
 */
export function isOk<T, E>(result: Result<T, E>): result is Success<T> {
  return result.success === true
}

/**
 * Type guard para verificar se é falha
 */
export function isFail<T, E>(result: Result<T, E>): result is Failure<E> {
  return result.success === false
}

/**
 * Extrai o valor de um Result ou lança erro
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.data
  }
  throw result.error
}

/**
 * Extrai o valor de um Result ou retorna valor padrão
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isOk(result)) {
    return result.data
  }
  return defaultValue
}

/**
 * Mapeia o valor de sucesso
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (isOk(result)) {
    return ok(fn(result.data))
  }
  return result
}

/**
 * Mapeia o erro
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (isFail(result)) {
    return fail(fn(result.error))
  }
  return result
}
