/**
 * Horários livres de um profissional num dia — regra pura, sem I/O
 * (docs/ROADMAP.md, fase 7, fatia 7f).
 *
 * É o cálculo ÚNICO que a página pública de agendamento usa. Tudo é medido em
 * MINUTOS desde a meia-noite do dia, em Brasília: quem chama converte expediente,
 * intervalos e ocupações para essa régua, e a conta fica sem fuso nem Date.
 *
 * Um horário só é oferecido se o atendimento INTEIRO (do início ao fim da duração
 * reservada) cabe num período de trabalho, não encosta em intervalo e não
 * encosta em nada ocupado. É a mesma pergunta que `createAppointmentService` faz
 * ao gravar — só que este também olha os intervalos.
 */

/** Um trecho do dia, em minutos desde 00:00 (Brasília). `end` é exclusivo. */
export type MinuteRange = { start: number; end: number }

export const BOOKING_SLOT_STEP_MINUTES = 15

export const MINUTES_PER_DAY = 24 * 60

export type DaySlotsInput = {
  /** Períodos de trabalho do profissional no dia. */
  workSpans: readonly MinuteRange[]
  /** Intervalos (almoço) do dia. */
  breaks: readonly MinuteRange[]
  /**
   * Tudo o que ocupa o profissional: agendamentos (em qualquer salão), folgas e
   * bloqueios, Google e agenda oficial. Pode começar antes de 0 ou passar de 1440.
   */
  busy: readonly MinuteRange[]
  /** Quanto o atendimento reserva, em minutos. */
  duration: number
  /** De quanto em quanto tempo a grade oferece um início. Padrão: 15 minutos. */
  step?: number
  /**
   * Horários de início próprios do serviço ("só às 9h e às 14h"), em minutos.
   * Quando há, a grade não é usada: só estes são candidatos.
   */
  discreteStarts?: readonly number[] | null
  /** Não oferecer nada que comece antes deste minuto (hoje: agora + antecedência). */
  notBefore?: number | null
}

function overlaps(start: number, end: number, range: MinuteRange): boolean {
  return start < range.end && end > range.start
}

function isRange(range: MinuteRange): boolean {
  return Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start
}

/** Os inícios livres do dia, em minutos, em ordem e sem repetição. */
export function computeDaySlots(input: DaySlotsInput): number[] {
  const duration = Math.floor(input.duration)
  const step = Math.floor(input.step ?? BOOKING_SLOT_STEP_MINUTES)
  if (!(duration > 0) || !(step > 0)) return []

  const workSpans = input.workSpans.filter(isRange)
  const blocked = [...input.breaks, ...input.busy].filter(isRange)
  const notBefore = input.notBefore ?? null

  const candidates = new Set<number>()
  if (input.discreteStarts && input.discreteStarts.length > 0) {
    for (const start of input.discreteStarts) {
      if (Number.isInteger(start)) candidates.add(start)
    }
  } else {
    for (const span of workSpans) {
      for (let start = span.start; start + duration <= span.end; start += step) candidates.add(start)
    }
  }

  const free: number[] = []
  for (const start of candidates) {
    const end = start + duration
    if (start < 0 || end > MINUTES_PER_DAY) continue
    if (notBefore !== null && start < notBefore) continue
    if (!workSpans.some((span) => start >= span.start && end <= span.end)) continue
    if (blocked.some((range) => overlaps(start, end, range))) continue
    free.push(start)
  }

  return free.sort((a, b) => a - b)
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** "AAAA-MM-DD" que existe no calendário. */
export function isBookingDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = DAY_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Dia da semana de um "AAAA-MM-DD": 0 = domingo … 6 = sábado. */
export function bookingDayOfWeek(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

/**
 * O instante em que o dia começa em Brasília. O Brasil não tem horário de verão
 * desde 2019: Brasília é UTC-3 o ano inteiro.
 */
export function bookingDayStart(day: string): Date {
  return new Date(`${day}T00:00:00-03:00`)
}

/** O "AAAA-MM-DD" de um instante, em Brasília. */
export function bookingDayOf(instant: Date): string {
  return new Date(instant.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Soma dias a um "AAAA-MM-DD". */
export function addBookingDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

/** Um intervalo de instantes na régua de minutos do dia. */
export function toDayMinutes(dayStart: Date, range: { start: Date; end: Date }): MinuteRange {
  return {
    start: Math.floor((range.start.getTime() - dayStart.getTime()) / 60000),
    // Arredonda o fim para cima: 10:00:30 ocupa o minuto das 10:00.
    end: Math.ceil((range.end.getTime() - dayStart.getTime()) / 60000),
  }
}

/** "HH:mm" ou "HH:mm:ss" → minutos. NULL se não for um horário. */
export function clockToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

export function minutesToClock(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// ============================================================================
// Agendamento online — o que a página pública aceita
// ============================================================================

export const ONLINE_BOOKING_LIMITS = {
  /** Antecedência mínima, em minutos: ninguém marca para daqui a cinco minutos. */
  minAdvanceMinutes: 60,
  /** Até quantos dias à frente a página mostra. */
  horizonDays: 30,
  /** Agendamentos futuros que o mesmo telefone pode ter no salão. */
  futurePerCustomer: 3,
  name: { min: 2, max: 80 },
} as const

/** O primeiro e o último dia que a página oferece, a partir de agora. */
export function onlineBookingWindow(now: Date): { firstDay: string; lastDay: string } {
  const firstDay = bookingDayOf(now)
  return { firstDay, lastDay: addBookingDays(firstDay, ONLINE_BOOKING_LIMITS.horizonDays) }
}

/**
 * A partir de que minuto do dia dá para marcar. NULL = o dia inteiro está fora
 * (já passou, ou está além do que a página oferece).
 */
export function onlineBookingNotBefore(day: string, now: Date): number | null {
  const { firstDay, lastDay } = onlineBookingWindow(now)
  if (day < firstDay || day > lastDay) return null
  const earliest = new Date(now.getTime() + ONLINE_BOOKING_LIMITS.minAdvanceMinutes * 60000)
  const minutes = Math.ceil((earliest.getTime() - bookingDayStart(day).getTime()) / 60000)
  if (minutes >= MINUTES_PER_DAY) return null
  return Math.max(0, minutes)
}

/**
 * O teto de agendamentos futuros por telefone: é a principal trava contra abuso
 * da página (não há confirmação do telefone). Recebe quantos agendamentos
 * futuros, pendentes ou confirmados, o cadastro JÁ tem no salão; devolve a recusa
 * ou NULL quando ainda cabe mais um.
 */
export function onlineBookingLimitError(futureAppointments: number): string | null {
  const limit = ONLINE_BOOKING_LIMITS.futurePerCustomer
  // Contagem que não é número não libera: na dúvida, recusa.
  if (Number.isFinite(futureAppointments) && futureAppointments < limit) return null
  return `Este telefone já tem ${limit} horários marcados. Fale com o salão para marcar mais`
}

export type OnlineBookingCustomerPlan =
  | { ok: true; name: string; phoneDigits: string }
  | { ok: false; error: string }

/**
 * Valida o que o cliente digita na página: nome e celular com DDD. Devolve só os
 * dígitos do telefone, sem o 55 — quem grava decide o formato do cadastro.
 */
export function planOnlineBookingCustomer(input: { name: unknown; phone: unknown }): OnlineBookingCustomerPlan {
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : ''
  const { min, max } = ONLINE_BOOKING_LIMITS.name
  if (name.length < min) return { ok: false, error: 'Escreva o seu nome' }
  if (name.length > max) return { ok: false, error: `O nome tem até ${max} caracteres` }
  if (!/\p{L}/u.test(name)) return { ok: false, error: 'Escreva o seu nome' }

  let digits = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : ''
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2)
  // DDD (2) + número (8 fixo, 9 celular). DDD não começa com 0.
  if (!/^[1-9]\d(\d{8}|9\d{8})$/.test(digits)) {
    return { ok: false, error: 'Informe o seu WhatsApp com DDD. Ex.: (11) 91234-5678' }
  }
  if (/^(\d)\1+$/.test(digits.slice(2))) {
    return { ok: false, error: 'Informe o seu WhatsApp com DDD. Ex.: (11) 91234-5678' }
  }
  return { ok: true, name, phoneDigits: digits }
}
