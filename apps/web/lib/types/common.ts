/**
 * Tipos comuns e compartilhados em toda a aplicação
 */

export type ActionResult<T = void> = 
  | { success: true; data?: T }
  | { error: string }

export type ActionState = { error?: string }

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

