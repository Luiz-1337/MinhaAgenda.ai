/**
 * Tipos relacionados a profissionais
 */

export interface ProfessionalRow {
  id: string
  salon_id: string
  name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
}

export interface UpsertProfessionalInput {
  id?: string
  name: string
  email: string
  phone?: string
  isActive: boolean
}

export interface ProfessionalDbRow {
  id: string
  salon_id: string
  name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
}

