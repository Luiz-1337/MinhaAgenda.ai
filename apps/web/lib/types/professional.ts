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
  working_days?: number[] // Dias da semana que trabalha (0=domingo, 1=segunda, etc)
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

