import { and, asc, desc, eq, sql } from "drizzle-orm"

import { appointments, customers, db, professionals, profiles, services } from "../index"
import {
  buildBirthdayList,
  buildCreationReport,
  buildInactiveList,
  buildOriginReport,
  countByStatus,
  type AppointmentReportStatus,
  type BirthdayRow,
  type CreationReport,
  type InactiveRow,
  type OriginRow,
  type ReportAppointment,
  type StatusCounts,
} from "../domain/agenda-reports"

/**
 * Relatórios de agendamentos e de clientes (docs/ROADMAP.md, fase 9, fatia 9c).
 *
 * Só leitura: busca as linhas e entrega para a regra pura
 * (domain/agenda-reports.ts). Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 *
 * Os dias são de Brasília. `date`, `created_at` e `cancelled_at` são timestamp
 * sem fuso, gravados em UTC.
 */

/** Teto de linhas lidas. Acima disso a tela pede um período menor. */
export const AGENDA_REPORT_ROWS = 3000

/** Teto das listas de clientes. */
export const CUSTOMER_REPORT_ROWS = 1000

const brazilTime = (column: unknown) => sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')`
const brazilDay = (column: unknown) => sql<string>`${brazilTime(column)}::date`

export type AppointmentReportRows = { rows: ReportAppointment[]; truncated: boolean }

/**
 * Os agendamentos do período `from`–`to` ("YYYY-MM-DD", já validado).
 *
 * `by: 'day'` filtra pelo dia do ATENDIMENTO; `by: 'created'`, pelo dia em que o
 * agendamento foi criado. Bloqueios de horário (serviço e cliente de sistema)
 * ficam de fora: não são atendimento.
 */
export async function listReportAppointmentsService(input: {
  salonId: string
  from: string
  to: string
  by: "day" | "created"
  onlyCancelled?: boolean
}): Promise<AppointmentReportRows> {
  const day = brazilDay(appointments.date)
  const createdDay = brazilDay(appointments.createdAt)
  const filterDay = input.by === "created" ? createdDay : day

  const rows = await db
    .select({
      id: appointments.id,
      day,
      time: sql<string>`to_char(${brazilTime(appointments.date)}, 'HH24:MI')`,
      status: appointments.status,
      customerName: customers.name,
      serviceName: services.name,
      professionalName: professionals.name,
      leadSource: appointments.leadSource,
      syncSource: appointments.syncSource,
      createdDay,
      cancelledDay: sql<string | null>`${brazilTime(appointments.cancelledAt)}::date`,
      cancelReason: appointments.cancelReason,
      cancelledByFirstName: profiles.firstName,
      cancelledByFullName: profiles.fullName,
    })
    .from(appointments)
    .innerJoin(customers, eq(customers.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .leftJoin(profiles, eq(profiles.id, appointments.cancelledBy))
    .where(
      and(
        eq(appointments.salonId, input.salonId),
        eq(services.isSystem, false),
        eq(customers.isSystem, false),
        input.onlyCancelled ? eq(appointments.status, "cancelled") : undefined,
        sql`${filterDay} BETWEEN ${input.from}::date AND ${input.to}::date`
      )
    )
    .orderBy(input.by === "created" ? asc(appointments.createdAt) : asc(appointments.date))
    .limit(AGENDA_REPORT_ROWS + 1)

  return {
    truncated: rows.length > AGENDA_REPORT_ROWS,
    rows: rows.slice(0, AGENDA_REPORT_ROWS).map((row) => ({
      id: row.id,
      day: row.day,
      time: row.time,
      status: row.status as AppointmentReportStatus,
      customerName: row.customerName,
      serviceName: row.serviceName,
      professionalName: row.professionalName,
      leadSource: row.leadSource,
      syncSource: row.syncSource,
      createdDay: row.createdDay,
      cancelledDay: row.cancelledDay,
      cancelReason: row.cancelReason,
      cancelledByName: row.cancelledByFirstName || row.cancelledByFullName?.split(" ")[0] || null,
    })),
  }
}

export type AppointmentReport =
  | { view: "all"; rows: ReportAppointment[]; counts: StatusCounts; truncated: boolean }
  | { view: "cancelled"; rows: ReportAppointment[]; truncated: boolean }
  | { view: "origin"; origins: OriginRow[]; total: number; truncated: boolean }
  | { view: "creation"; report: CreationReport; truncated: boolean }

/** O relatório de agendamentos pedido, do período. */
export async function getAppointmentReportService(input: {
  salonId: string
  view: "all" | "cancelled" | "origin" | "creation"
  from: string
  to: string
}): Promise<AppointmentReport> {
  const { rows, truncated } = await listReportAppointmentsService({
    salonId: input.salonId,
    from: input.from,
    to: input.to,
    by: input.view === "creation" ? "created" : "day",
    onlyCancelled: input.view === "cancelled",
  })

  if (input.view === "all") return { view: "all", rows, counts: countByStatus(rows), truncated }
  if (input.view === "cancelled") return { view: "cancelled", rows, truncated }
  if (input.view === "origin") return { view: "origin", origins: buildOriginReport(rows), total: rows.length, truncated }
  return { view: "creation", report: buildCreationReport(rows), truncated }
}

// ============================================================================
// Clientes
// ============================================================================

/**
 * Os aniversariantes de um mês (1 a 12). `showPhones` vem da action: sem a
 * permissão de ver telefones, o telefone nem sai do banco.
 */
export async function listBirthdaysService(input: {
  salonId: string
  month: number
  year: number
  showPhones: boolean
}): Promise<{ rows: BirthdayRow[]; truncated: boolean }> {
  const rows = await db
    .select({ id: customers.id, name: customers.name, birthDate: customers.birthDate, phone: customers.phone })
    .from(customers)
    .where(
      and(
        eq(customers.salonId, input.salonId),
        eq(customers.isSystem, false),
        sql`${customers.birthDate} IS NOT NULL`,
        sql`extract(month from ${customers.birthDate}) = ${input.month}`
      )
    )
    .limit(CUSTOMER_REPORT_ROWS + 1)

  return {
    truncated: rows.length > CUSTOMER_REPORT_ROWS,
    rows: buildBirthdayList(
      rows.slice(0, CUSTOMER_REPORT_ROWS).map((row) => ({
        id: row.id,
        name: row.name,
        birthDate: row.birthDate as string,
        phone: input.showPhones ? row.phone : null,
      })),
      input.year
    ),
  }
}

/**
 * Os inativos: quem já veio (atendimento concluído ou comanda faturada), não vem
 * há `days` dias ou mais e não tem horário marcado daqui para a frente.
 */
export async function listInactiveCustomersService(input: {
  salonId: string
  /** Hoje em Brasília, "YYYY-MM-DD". */
  today: string
  days: number
  showPhones: boolean
}): Promise<{ rows: InactiveRow[]; truncated: boolean }> {
  const lastVisit = sql<string | null>`greatest(
    (select max((a.date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date)
       from appointments a
      where a.client_id = "customers"."id" and a.salon_id = ${input.salonId} and a.status = 'completed'),
    (select max((s.sale_date AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date)
       from sales s
      where s.customer_id = "customers"."id" and s.salon_id = ${input.salonId} and s.status = 'invoiced')
  )`

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      lastVisit,
      visits: sql<number>`(
        select count(*)::int from appointments a
        where a.client_id = "customers"."id" and a.salon_id = ${input.salonId} and a.status = 'completed'
      )`,
      hasUpcoming: sql<boolean>`exists (
        select 1 from appointments a
        where a.client_id = "customers"."id" and a.salon_id = ${input.salonId}
          and a.status in ('pending', 'confirmed') and a.date > now()
      )`,
    })
    .from(customers)
    .where(
      and(
        eq(customers.salonId, input.salonId),
        eq(customers.isSystem, false),
        sql`${lastVisit} <= (${input.today}::date - ${input.days}::int)`
      )
    )
    .orderBy(desc(lastVisit))
    .limit(CUSTOMER_REPORT_ROWS + 1)

  return {
    truncated: rows.length > CUSTOMER_REPORT_ROWS,
    rows: buildInactiveList(
      rows.slice(0, CUSTOMER_REPORT_ROWS).map((row) => ({
        id: row.id,
        name: row.name,
        lastVisit: row.lastVisit as string,
        visits: Number(row.visits),
        hasUpcoming: row.hasUpcoming,
        phone: input.showPhones ? row.phone : null,
      })),
      { today: input.today, days: input.days }
    ),
  }
}
