/**
 * Tipos relacionados a serviços
 */

export type PriceType = 'fixed' | 'range'

export interface ServiceRow {
  id: string
  salon_id: string
  name: string
  description: string | null
  duration: number
  price: string
  price_type: PriceType
  price_min: string | null
  price_max: string | null
  is_active: boolean
}

export interface UpsertServiceInput {
  id?: string
  name: string
  description?: string
  duration: number
  price: number
  priceType: PriceType
  priceMin?: number
  priceMax?: number
  isActive: boolean
  professionalIds: string[]
}

export interface ServicePayload {
  name: string
  description: string | null
  duration: number
  price: string
  priceType: PriceType
  priceMin: string | null
  priceMax: string | null
  isActive: boolean
}

