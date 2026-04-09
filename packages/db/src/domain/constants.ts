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

/**
 * Google Calendar Sync constants
 */
export const GOOGLE_SYNC_LOOP_WINDOW_MS = 60 * 1000 // 60 seconds - skip echo changes within this window
export const GOOGLE_CHANNEL_EXPIRY_DAYS = 6 // Watch channels expire in ~7 days, renew at 6
export const GOOGLE_CHANNEL_RENEWAL_THRESHOLD_MS = 24 * 60 * 60 * 1000 // Renew channels expiring in <24h
export const GOOGLE_BLOCKED_TIME_SERVICE_NAME = 'Bloqueio de Horário' as const
export const GOOGLE_CALENDAR_PLACEHOLDER_PHONE = '0000000000' as const
