/**
 * Constantes do sistema
 */

/** Timezone padrão do Brasil */
export const TIMEZONE = "America/Sao_Paulo"

/** Formato de data para exibição */
export const DATE_FORMAT = "dd/MM/yyyy"

/** Formato de hora para exibição */
export const TIME_FORMAT = "HH:mm"

/** Formato de data e hora para exibição */
export const DATETIME_FORMAT = "dd/MM/yyyy HH:mm"

/** Duração padrão de um slot em minutos */
export const SLOT_DURATION = 15

/** Número máximo de dias para agendamento antecipado */
export const MAX_ADVANCE_DAYS = 30

/** Horário padrão de início do expediente */
export const DEFAULT_START_TIME = "09:00"

/** Horário padrão de fim do expediente */
export const DEFAULT_END_TIME = "18:00"

/** Offset do timezone de São Paulo em relação ao UTC */
export const SAO_PAULO_OFFSET = "-03:00"

/** Regex para validação de telefone brasileiro */
export const BRAZILIAN_PHONE_REGEX = /^(\+?55)?(\d{2})(\d{8,9})$/

/** Regex para data ISO com timezone */
export const ISO_DATETIME_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/

/** Regex para data ISO sem timezone */
export const ISO_DATETIME_WITHOUT_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

/** Regex para apenas data */
export const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Rate limits para operações */
export const RATE_LIMITS = {
  CREATE_APPOINTMENT: { windowMs: 60_000, max: 10 },
  CHECK_AVAILABILITY: { windowMs: 60_000, max: 30 },
  UPDATE_APPOINTMENT: { windowMs: 60_000, max: 20 },
  DELETE_APPOINTMENT: { windowMs: 60_000, max: 10 },
} as const
