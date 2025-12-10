/**
 * Tipos relacionados a serviços
 */

export interface ServiceRow {
  id: string
  salon_id: string
  name: string
  description: string | null
  duration: number
  price: string
  is_active: boolean
}

export interface UpsertServiceInput {
  id?: string
  name: string
  description?: string
  duration: number
  price: number
  isActive: boolean
  professionalIds: string[]
}

export interface ServicePayload {
  name: string
  description: string | null
  duration: number
  price: string
  isActive: boolean
}

