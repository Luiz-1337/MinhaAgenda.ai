import type { Result } from "../../src/shared/types"

export function okResult<T>(data: T): Result<T, Error> {
  return {
    success: true,
    data,
  }
}

export function failResult<T>(error: Error): Result<T, Error> {
  return {
    success: false,
    error,
  }
}
