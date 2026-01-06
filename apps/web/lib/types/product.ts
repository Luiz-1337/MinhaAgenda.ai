/**
 * Tipos relacionados a produtos
 */

export interface ProductRow {
  id: string
  salon_id: string
  name: string
  description: string | null
  price: string
  is_active: boolean
}

export interface UpsertProductInput {
  id?: string
  name: string
  description?: string
  price: number
  isActive: boolean
}

export interface ProductPayload {
  name: string
  description: string | null
  price: string
  isActive: boolean
}

