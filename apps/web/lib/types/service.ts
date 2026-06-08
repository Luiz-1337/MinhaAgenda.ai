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
  duration_max: number | null
  price: string
  price_type: PriceType
  price_min: string | null
  price_max: string | null
  price_on_request: boolean
  allowed_weekdays: number[] | null
  allowed_start_times: string[] | null
  is_active: boolean
  average_cycle_days: number | null
}

export interface UpsertServiceInput {
  id?: string
  name: string
  description?: string
  duration: number
  /** Teto da faixa de duração (min). Ausente/null = duração única. */
  durationMax?: number | null
  price: number
  priceType: PriceType
  priceMin?: number
  priceMax?: number
  /** "Sob Avaliação": informa que o valor depende de avaliação. */
  priceOnRequest?: boolean
  /** Dias permitidos (0=Dom..6=Sáb). Vazio = todos os dias. */
  allowedWeekdays?: number[]
  /** Horários de início "HH:mm". Vazio = grade contínua. */
  allowedStartTimes?: string[]
  isActive: boolean
  averageCycleDays?: number | null
  professionalIds: string[]
  /** Subconjunto de professionalIds marcados como especialistas no serviço. */
  specialistProfessionalIds: string[]
}

export interface ServicePayload {
  name: string
  description: string | null
  duration: number
  durationMax: number | null
  price: string
  priceType: PriceType
  priceMin: string | null
  priceMax: string | null
  priceOnRequest: boolean
  allowedWeekdays: number[] | null
  allowedStartTimes: string[] | null
  isActive: boolean
  averageCycleDays: number | null
}

