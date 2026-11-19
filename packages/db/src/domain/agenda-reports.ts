/**
 * Relatórios de agendamentos e de clientes — regra pura, sem I/O
 * (docs/ROADMAP.md, fase 9, fatia 9c).
 *
 * Agendamentos: todos, cancelados, origem e criação. Clientes: aniversariantes e
 * inativos. O serviço busca as linhas; aqui se conta, agrupa e ordena.
 */
import { brazilToday } from './finance'

// ============================================================================
// Agendamentos
// ============================================================================

export const APPOINTMENT_REPORT_VIEWS = ['all', 'cancelled', 'origin', 'creation'] as const

export type AppointmentReportView = (typeof APPOINTMENT_REPORT_VIEWS)[number]

export const APPOINTMENT_REPORT_VIEW_LABELS: Record<AppointmentReportView, string> = {
  all: 'Todos os agendamentos',
  cancelled: 'Agendamentos cancelados',
  origin: 'Origem dos agendamentos',
  creation: 'Criação de agendamento',
}

export function parseAppointmentReportView(value: unknown): AppointmentReportView {
  return (APPOINTMENT_REPORT_VIEWS as readonly string[]).includes(value as string)
    ? (value as AppointmentReportView)
    : 'all'
}

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'completed', 'no_show', 'cancelled'] as const

export type AppointmentReportStatus = (typeof APPOINTMENT_STATUSES)[number]

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentReportStatus, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  no_show: 'Falta',
  cancelled: 'Cancelado',
}

/** Um agendamento do relatório. Datas já em Brasília. */
export type ReportAppointment = {
  id: string
  /** O dia do atendimento, "AAAA-MM-DD". */
  day: string
  /** "HH:mm". */
  time: string
  status: AppointmentReportStatus
  customerName: string
  serviceName: string
  professionalName: string
  /** 'paid_traffic' | 'organic' | null. */
  leadSource: string | null
  /** 'app' | 'google' | null. */
  syncSource: string | null
  /** O dia em que o agendamento foi criado. */
  createdDay: string
  cancelledDay: string | null
  cancelReason: string | null
  cancelledByName: string | null
}

export type StatusCounts = Record<AppointmentReportStatus, number> & { total: number }

export function countByStatus(rows: readonly ReportAppointment[]): StatusCounts {
  const counts: StatusCounts = { pending: 0, confirmed: 0, completed: 0, no_show: 0, cancelled: 0, total: 0 }
  for (const row of rows) {
    counts[row.status] += 1
    counts.total += 1
  }
  return counts
}

export const APPOINTMENT_ORIGINS = ['paid_traffic', 'organic', 'google_calendar', 'unknown'] as const

export type AppointmentOrigin = (typeof APPOINTMENT_ORIGINS)[number]

export const APPOINTMENT_ORIGIN_LABELS: Record<AppointmentOrigin, string> = {
  paid_traffic: 'Anúncio (tráfego pago)',
  organic: 'Orgânico',
  google_calendar: 'Veio do Google Calendar',
  unknown: 'Não se sabe',
}

/**
 * De onde veio o agendamento. O que nasceu no Google Calendar é separado antes:
 * não foi o salão que marcou por aqui. O resto segue a origem do lead gravada no
 * agendamento (anúncio ou orgânico); sem ela, "não se sabe".
 */
export function appointmentOrigin(row: { leadSource: string | null; syncSource: string | null }): AppointmentOrigin {
  if (row.syncSource === 'google') return 'google_calendar'
  if (row.leadSource === 'paid_traffic') return 'paid_traffic'
  if (row.leadSource === 'organic') return 'organic'
  return 'unknown'
}

export type OriginRow = {
  origin: AppointmentOrigin
  total: number
  completed: number
  noShow: number
  cancelled: number
  /** Concluídos ÷ (total − ainda por acontecer), em %. NULL sem nenhum desfecho. */
  completionPercent: number | null
}

/** Uma linha por origem (as quatro, mesmo zeradas), com o desfecho de cada uma. */
export function buildOriginReport(rows: readonly ReportAppointment[]): OriginRow[] {
  const map = new Map<AppointmentOrigin, OriginRow>(
    APPOINTMENT_ORIGINS.map((origin) => [
      origin,
      { origin, total: 0, completed: 0, noShow: 0, cancelled: 0, completionPercent: null },
    ])
  )
  for (const row of rows) {
    const entry = map.get(appointmentOrigin(row)) as OriginRow
    entry.total += 1
    if (row.status === 'completed') entry.completed += 1
    else if (row.status === 'no_show') entry.noShow += 1
    else if (row.status === 'cancelled') entry.cancelled += 1
  }
  for (const entry of map.values()) {
    const settled = entry.completed + entry.noShow + entry.cancelled
    entry.completionPercent = settled > 0 ? Math.round((entry.completed / settled) * 1000) / 10 : null
  }
  return [...map.values()]
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

export const LEAD_TIME_BUCKETS = [
  { key: 'same_day', label: 'No mesmo dia', max: 0 },
  { key: 'one_two', label: '1 a 2 dias antes', max: 2 },
  { key: 'three_seven', label: '3 a 7 dias antes', max: 7 },
  { key: 'more', label: 'Mais de 7 dias antes', max: Infinity },
] as const

export type CreationReport = {
  /** Quantos foram criados em cada dia (só os dias com algum). */
  days: { day: string; created: number }[]
  /** Com quanta antecedência foram marcados. */
  buckets: { key: string; label: string; count: number }[]
  total: number
  /** Média de dias entre criar e atender. NULL sem agendamentos. */
  averageLeadDays: number | null
}

/**
 * Quando os agendamentos foram CRIADOS (as linhas já vêm filtradas pelo dia da
 * criação). Agendamento registrado depois do atendimento conta como "no mesmo dia".
 */
export function buildCreationReport(rows: readonly ReportAppointment[]): CreationReport {
  const days = new Map<string, number>()
  const buckets = LEAD_TIME_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, count: 0 }))
  let leadSum = 0

  for (const row of rows) {
    days.set(row.createdDay, (days.get(row.createdDay) ?? 0) + 1)
    const lead = Math.max(0, dayDiff(row.createdDay, row.day))
    leadSum += lead
    buckets[LEAD_TIME_BUCKETS.findIndex((bucket) => lead <= bucket.max)].count += 1
  }

  return {
    days: [...days.entries()].map(([day, created]) => ({ day, created })).sort((a, b) => a.day.localeCompare(b.day)),
    buckets,
    total: rows.length,
    averageLeadDays: rows.length > 0 ? Math.round((leadSum / rows.length) * 10) / 10 : null,
  }
}

// ============================================================================
// Clientes
// ============================================================================

export const CUSTOMER_REPORT_VIEWS = ['birthdays', 'inactive'] as const

export type CustomerReportView = (typeof CUSTOMER_REPORT_VIEWS)[number]

export const CUSTOMER_REPORT_VIEW_LABELS: Record<CustomerReportView, string> = {
  birthdays: 'Aniversariantes',
  inactive: 'Inativos',
}

export function parseCustomerReportView(value: unknown): CustomerReportView {
  return (CUSTOMER_REPORT_VIEWS as readonly string[]).includes(value as string)
    ? (value as CustomerReportView)
    : 'birthdays'
}

export const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

/** O mês dos aniversariantes (1 a 12). Sem mês válido, o mês de hoje em Brasília. */
export function planBirthdayMonth(value: unknown, now: Date): number {
  const month = typeof value === 'string' && /^\d{1,2}$/.test(value) ? Number(value) : Number.NaN
  if (month >= 1 && month <= 12) return month
  return Number(brazilToday(now).slice(5, 7))
}

export type BirthdayRow = {
  id: string
  name: string
  /** O dia do mês. */
  day: number
  /** Quantos anos a pessoa faz no aniversário deste ano. */
  turning: number
  phone: string | null
}

/**
 * Os aniversariantes do mês, pelo dia. `year` é o ano do aniversário: quem nasceu
 * depois dele não entra (data de nascimento no futuro).
 */
export function buildBirthdayList(
  customers: readonly { id: string; name: string; birthDate: string; phone: string | null }[],
  year: number
): BirthdayRow[] {
  return customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      day: Number(customer.birthDate.slice(8, 10)),
      turning: year - Number(customer.birthDate.slice(0, 4)),
      phone: customer.phone,
    }))
    .filter((row) => row.turning >= 0)
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'pt-BR'))
}

export const INACTIVE_DAYS_OPTIONS = [30, 60, 90, 180, 365] as const

export const INACTIVE_DAYS_DEFAULT = 60

/** Há quantos dias sem vir o cliente passa a ser "inativo". Fora das opções, 60. */
export function planInactiveDays(value: unknown): number {
  const days = typeof value === 'string' ? Number(value) : Number.NaN
  return (INACTIVE_DAYS_OPTIONS as readonly number[]).includes(days) ? days : INACTIVE_DAYS_DEFAULT
}

export type InactiveRow = {
  id: string
  name: string
  /** O dia do último atendimento concluído ou comanda faturada. */
  lastVisit: string
  daysAway: number
  visits: number
  phone: string | null
}

/**
 * Os inativos: quem já veio, não vem há `days` dias ou mais e não tem horário
 * marcado. Quem sumiu há menos tempo vem primeiro — é quem ainda dá para chamar.
 */
export function buildInactiveList(
  customers: readonly {
    id: string
    name: string
    lastVisit: string
    visits: number
    hasUpcoming: boolean
    phone: string | null
  }[],
  input: { today: string; days: number }
): InactiveRow[] {
  return customers
    .filter((customer) => !customer.hasUpcoming)
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      lastVisit: customer.lastVisit,
      daysAway: dayDiff(customer.lastVisit, input.today),
      visits: customer.visits,
      phone: customer.phone,
    }))
    .filter((row) => row.daysAway >= input.days)
    .sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name, 'pt-BR'))
}
