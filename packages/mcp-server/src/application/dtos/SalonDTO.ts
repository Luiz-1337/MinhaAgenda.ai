import { WeeklyWorkingHours } from "../../shared/types/common.types"

/**
 * DTO para informações do salão
 */
export interface SalonDTO {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  whatsapp?: string | null
  description?: string | null
  cancellationPolicy?: string
  businessHours: WeeklyWorkingHours | null
  settings: Record<string, unknown>
  message: string
}

/**
 * DTO para preferência do cliente
 */
export interface CustomerPreferenceDTO {
  customerId: string
  key: string
  value: string | number | boolean
  message: string
}

/**
 * DTO para qualificação de lead
 */
export interface QualifyLeadDTO {
  salonId: string
  phoneNumber: string
  interest: "high" | "medium" | "low" | "none"
  notes?: string
}

/**
 * DTO de resultado de qualificação
 */
export interface QualifyLeadResultDTO {
  leadId: string
  status: string
  message: string
}
