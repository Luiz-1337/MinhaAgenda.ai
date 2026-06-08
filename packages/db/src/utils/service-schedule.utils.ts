/**
 * Regras de agenda POR SERVIÇO — lógica única compartilhada pelos DOIS geradores de
 * slots (web e IA) e pelo validador de agendamento, para nunca divergirem.
 *
 * Convenção de dia da semana: 0=Domingo .. 6=Sábado (igual a Date.getDay() e ao
 * restante do código). Horários são "HH:mm" no fuso de Brasília.
 *
 * Colunas relacionadas em `services`:
 *  - allowed_weekdays  (jsonb number[]): dias permitidos. null/[] = todos os dias.
 *  - allowed_start_times (jsonb string[]): horários de início discretos. null/[] = grade contínua.
 *  - duration_max (int): teto da faixa de duração. A agenda reserva o MAIOR (duration_max ?? duration).
 */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/

const WEEKDAY_NAMES_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/**
 * Normaliza um horário para "HH:mm" (zero-padded). Retorna null se inválido.
 * Ex.: "9:5" -> inválido (minuto), "9:05" -> "09:05", "09:30" -> "09:30".
 */
export function normalizeTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const m = value.trim().match(TIME_RE)
  if (!m) return null
  const hour = String(Number(m[1])).padStart(2, '0')
  return `${hour}:${m[2]}`
}

/** "HH:mm" -> minutos desde a meia-noite. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** minutos desde a meia-noite -> "HH:mm". */
export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Lê com segurança o jsonb `allowed_weekdays` do banco para number[] | null.
 * Filtra valores fora de 0..6, deduplica e ordena. Vazio => null (sem restrição).
 */
export function parseAllowedWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const days = value
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  if (days.length === 0) return null
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

/**
 * Lê com segurança o jsonb `allowed_start_times` do banco, normalizado
 * (válidos, únicos, ordenados por horário). Vazio => null (grade contínua).
 */
export function parseAllowedStartTimes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const times: string[] = []
  for (const t of value) {
    const norm = normalizeTime(t)
    if (norm) times.push(norm)
  }
  if (times.length === 0) return null
  return Array.from(new Set(times)).sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
}

/** Dia permitido para o serviço? null/[] => todos os dias. */
export function isWeekdayAllowed(
  allowedWeekdays: number[] | null | undefined,
  dayOfWeek: number
): boolean {
  if (!allowedWeekdays || allowedWeekdays.length === 0) return true
  return allowedWeekdays.includes(dayOfWeek)
}

/** Horário de início permitido? null/[] => qualquer (grade contínua). */
export function isStartTimeAllowed(
  allowedStartTimes: string[] | null | undefined,
  hhmm: string
): boolean {
  if (!allowedStartTimes || allowedStartTimes.length === 0) return true
  const norm = normalizeTime(hhmm)
  return norm !== null && allowedStartTimes.includes(norm)
}

/**
 * Duração que a agenda deve RESERVAR: o MAIOR da faixa (decisão de produto).
 * `duration` é o piso/exibição; `durationMax` (quando maior) é o que bloqueia.
 */
export function getBlockingDuration(duration: number, durationMax?: number | null): number {
  if (typeof durationMax === 'number' && durationMax > duration) return durationMax
  return duration
}

/** Lista de dias (0-6) em PT-BR curto: [2,3,5,6] -> "Ter, Qua, Sex, Sáb". */
export function formatWeekdaysPtBr(days: number[]): string {
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_NAMES_PT[d] ?? String(d))
    .join(', ')
}
