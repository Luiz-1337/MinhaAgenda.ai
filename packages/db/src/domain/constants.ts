/**
 * Domain constants - extracted magic numbers and strings
 */

export const GOOGLE_TIMEZONE_DEFAULT = 'America/Sao_Paulo' as const
export const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000 // 5 minutes
export const TRINKS_API_BASE_URL = 'https://api.trinks.com/v1' as const
export const RAG_SIMILARITY_THRESHOLD = 0.7

/**
 * Status mapping between internal and external systems
 */
export const APPOINTMENT_STATUS_MAP = {
  pending: 'pendente',
  confirmed: 'confirmado',
  cancelled: 'cancelado',
  completed: 'finalizado',
  'no-show': 'cliente_faltou',
  'in-progress': 'em_atendimento',
} as const

/**
 * Google Calendar reminder configuration
 */
export const GOOGLE_EVENT_REMINDERS = {
  email: { method: 'email' as const, minutes: 24 * 60 }, // 1 day before
  popup: { method: 'popup' as const, minutes: 30 }, // 30 minutes before
} as const
