/**
 * DTO para um slot de tempo
 */
export interface TimeSlotDTO {
  time: string // "HH:mm"
  available: boolean
  professionalId?: string
  professionalName?: string
}

/**
 * DTO para disponibilidade
 */
export interface AvailabilityDTO {
  date: string // formatado para exibição
  dateISO: string // ISO para processamento
  professional?: string
  professionalId?: string
  slots: TimeSlotDTO[]
  totalAvailable: number
  message: string
}

/**
 * DTO para verificação de disponibilidade
 */
export interface CheckAvailabilityDTO {
  salonId: string
  date: string // ISO datetime
  professionalId?: string
  serviceId?: string
  serviceDuration?: number
}

/**
 * DTO para regras de disponibilidade de um profissional
 */
export interface ProfessionalAvailabilityRulesDTO {
  professionalId: string
  professionalName: string
  rules: {
    dayOfWeek: number
    dayName: string
    startTime: string
    endTime: string
    isBreak: boolean
  }[]
  message: string
}
