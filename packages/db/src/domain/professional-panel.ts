/**
 * Painel de profissionais — regra pura, sem I/O (docs/ROADMAP.md, fase 9, fatia 9e).
 *
 * Uma linha por profissional, no período: clientes únicos, valor realizado,
 * ticket médio, frequência e ocupação. Os quatro primeiros saem das comandas
 * faturadas; a ocupação, da agenda (tempo marcado ÷ tempo de expediente).
 */
import { bookingDayOfWeek, clockToMinutes } from './booking-slots'
import { addDaysToDate } from './finance'

/** Abaixo disso o painel marca "baixa ocupação". */
export const LOW_OCCUPANCY_PERCENT = 30

export type PanelProfessional = { id: string; name: string; isActive: boolean }

/** Um item (serviço ou produto) de comanda faturada, do período. */
export type PanelSaleItem = {
  professionalId: string | null
  saleId: string
  customerId: string
  kind: string
  totalCents: number
}

/** Um agendamento do período que ocupou a agenda (não cancelado, sem bloqueio). */
export type PanelAppointment = { professionalId: string; minutes: number }

/** Uma linha do expediente semanal: 0 = domingo … 6 = sábado. */
export type PanelAvailability = {
  professionalId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isBreak: boolean
}

export type PanelRow = {
  professionalId: string
  name: string
  isActive: boolean
  /** Clientes diferentes atendidos (em comandas faturadas). */
  uniqueCustomers: number
  /** Comandas faturadas em que o profissional tem item. */
  sales: number
  /** O valor dos serviços que executou e dos produtos que vendeu. */
  revenueCents: number
  /** Valor ÷ comandas. NULL sem comanda. */
  averageTicketCents: number | null
  /** Comandas ÷ clientes únicos. NULL sem cliente. */
  frequency: number | null
  /** Agendamentos que ocuparam a agenda. */
  appointments: number
  bookedMinutes: number
  availableMinutes: number
  /** Marcado ÷ expediente, em %. NULL quando não há expediente cadastrado. */
  occupancyPercent: number | null
  lowOccupancy: boolean
}

export type PanelTotals = {
  uniqueCustomers: number
  sales: number
  revenueCents: number
  averageTicketCents: number | null
  bookedMinutes: number
  availableMinutes: number
  occupancyPercent: number | null
}

export type ProfessionalPanel = { rows: PanelRow[]; totals: PanelTotals }

/** Quantas vezes cada dia da semana cai entre `from` e `to` (inclusive). */
export function countWeekdays(from: string, to: string): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  // Teto de segurança: o período dos relatórios é de no máximo um ano.
  for (let day = from, guard = 0; day <= to && guard < 400; day = addDaysToDate(day, 1), guard += 1) {
    counts[bookingDayOfWeek(day)] += 1
  }
  return counts
}

/**
 * Minutos de expediente por dia da semana, de UM profissional: os períodos de
 * trabalho menos o que os intervalos cobrem deles.
 */
export function weeklyWorkMinutes(rules: readonly Omit<PanelAvailability, 'professionalId'>[]): number[] {
  const minutes = [0, 0, 0, 0, 0, 0, 0]
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const ranges = rules
      .filter((rule) => rule.dayOfWeek === weekday)
      .map((rule) => ({ start: clockToMinutes(rule.startTime), end: clockToMinutes(rule.endTime), isBreak: rule.isBreak }))
      .filter((range): range is { start: number; end: number; isBreak: boolean } =>
        range.start !== null && range.end !== null && range.end > range.start
      )
    const work = ranges.filter((range) => !range.isBreak)
    const breaks = ranges.filter((range) => range.isBreak)

    // Minuto a minuto: simples, e não conta duas vezes períodos que se sobrepõem.
    const worked = new Uint8Array(24 * 60)
    for (const span of work) worked.fill(1, Math.max(0, span.start), Math.min(1440, span.end))
    for (const pause of breaks) worked.fill(0, Math.max(0, pause.start), Math.min(1440, pause.end))
    minutes[weekday] = worked.reduce((sum, value) => sum + value, 0)
  }
  return minutes
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null
}

/**
 * Monta o painel. Entra todo profissional ativo, e o inativo que teve venda ou
 * agendamento no período. Quem mais realizou vem primeiro.
 */
export function buildProfessionalPanel(input: {
  professionals: readonly PanelProfessional[]
  items: readonly PanelSaleItem[]
  appointments: readonly PanelAppointment[]
  availability: readonly PanelAvailability[]
  from: string
  to: string
}): ProfessionalPanel {
  const weekdays = countWeekdays(input.from, input.to)

  const rows: PanelRow[] = []
  for (const professional of input.professionals) {
    const items = input.items.filter(
      (item) => item.professionalId === professional.id && (item.kind === 'service' || item.kind === 'product')
    )
    const appointments = input.appointments.filter((appointment) => appointment.professionalId === professional.id)
    if (!professional.isActive && items.length === 0 && appointments.length === 0) continue

    const customers = new Set(items.map((item) => item.customerId))
    const sales = new Set(items.map((item) => item.saleId))
    const revenueCents = items.reduce((sum, item) => sum + item.totalCents, 0)
    const bookedMinutes = appointments.reduce((sum, appointment) => sum + Math.max(0, appointment.minutes), 0)
    const weekly = weeklyWorkMinutes(input.availability.filter((rule) => rule.professionalId === professional.id))
    const availableMinutes = weekly.reduce((sum, minutes, weekday) => sum + minutes * weekdays[weekday], 0)
    const occupancyPercent = percent(bookedMinutes, availableMinutes)

    rows.push({
      professionalId: professional.id,
      name: professional.name,
      isActive: professional.isActive,
      uniqueCustomers: customers.size,
      sales: sales.size,
      revenueCents,
      averageTicketCents: sales.size > 0 ? Math.round(revenueCents / sales.size) : null,
      frequency: customers.size > 0 ? Math.round((sales.size / customers.size) * 10) / 10 : null,
      appointments: appointments.length,
      bookedMinutes,
      availableMinutes,
      occupancyPercent,
      lowOccupancy: occupancyPercent !== null && occupancyPercent < LOW_OCCUPANCY_PERCENT,
    })
  }

  rows.sort((a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, 'pt-BR'))

  // Os totais do salão não são a soma das linhas: o mesmo cliente e a mesma
  // comanda podem estar com dois profissionais.
  const counted = input.items.filter((item) => item.kind === 'service' || item.kind === 'product')
  const allSales = new Set(counted.map((item) => item.saleId))
  const revenueCents = counted.reduce((sum, item) => sum + item.totalCents, 0)
  const bookedMinutes = rows.reduce((sum, row) => sum + row.bookedMinutes, 0)
  const availableMinutes = rows.reduce((sum, row) => sum + row.availableMinutes, 0)

  return {
    rows,
    totals: {
      uniqueCustomers: new Set(counted.map((item) => item.customerId)).size,
      sales: allSales.size,
      revenueCents,
      averageTicketCents: allSales.size > 0 ? Math.round(revenueCents / allSales.size) : null,
      bookedMinutes,
      availableMinutes,
      occupancyPercent: percent(bookedMinutes, availableMinutes),
    },
  }
}
