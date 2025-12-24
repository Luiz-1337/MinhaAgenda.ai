/**
 * Tipos relacionados a profissionais
 */

// OWNER is deprecated and treated as MANAGER in frontend logic, but kept in DB enum.
// Frontend should map OWNER -> MANAGER when receiving data if necessary, or just treat OWNER as MANAGER.
export type ProfessionalRole = 'MANAGER' | 'STAFF'

export interface ProfessionalRow {
  id: string
  salon_id: string
  user_id?: string | null
  role: ProfessionalRole
  name: string
  email: string
  phone: string | null
  commission_rate: number | string // numeric returns string in pg usually, but app might treat as number
  is_active: boolean
  created_at: string
  working_days?: number[] // Dias da semana que trabalha (0=domingo, 1=segunda, etc)
}

export interface UpsertProfessionalInput {
  id?: string
  salonId?: string // Link to salon if creating new
  userId?: string // Link to existing user if available
  name: string
  email: string
  phone?: string
  role?: ProfessionalRole
  commissionRate?: number
  isActive: boolean
}

export interface ProfessionalDbRow {
  id: string
  salon_id: string
  user_id: string | null
  role: ProfessionalRole
  name: string
  email: string
  phone: string | null
  commission_rate: string
  is_active: boolean
  created_at: string
}
