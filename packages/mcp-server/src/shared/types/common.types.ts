/**
 * Tipos comuns compartilhados por todas as camadas
 */

/** ID único (UUID) */
export type ID = string

/** Timestamp Unix em milliseconds */
export type Timestamp = number

/** Paginação */
export interface Pagination {
  page: number
  limit: number
}

/** Resultado paginado */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

/** Status de agendamento */
export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed"

/** Nível de interesse do lead */
export type LeadInterest = "high" | "medium" | "low" | "none"

/** Provedores de integração */
export type IntegrationProvider = "google" | "trinks"

/** Dias da semana (0 = Domingo, 6 = Sábado) */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** Horário de funcionamento */
export interface WorkingHours {
  start: string // "HH:mm"
  end: string // "HH:mm"
}

/** Mapa de horários por dia da semana */
export type WeeklyWorkingHours = Partial<Record<DayOfWeek, WorkingHours>>
