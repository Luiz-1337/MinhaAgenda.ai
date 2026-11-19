import { and, asc, eq, ne, sql } from "drizzle-orm"

import { appointments, availability, db, professionals, services } from "../index"
import { buildProfessionalPanel, type ProfessionalPanel } from "../domain/professional-panel"
import { listSoldItemsService } from "./sales-reports.service"

/**
 * Painel de profissionais (docs/ROADMAP.md, fase 9, fatia 9e).
 *
 * Só leitura: busca as linhas e entrega para a regra pura
 * (domain/professional-panel.ts). Quem autoriza é a Server Action.
 *
 * Isolamento por salão: TODA consulta leva `salon_id`.
 */

/** Teto de agendamentos lidos. Acima disso a tela pede um período menor. */
export const PANEL_APPOINTMENT_ROWS = 10000

export type ProfessionalPanelReport = ProfessionalPanel & {
  /** Alguma leitura bateu no teto: os números são só do que foi lido. */
  truncated: boolean
}

/** O painel do período `from`–`to` ("YYYY-MM-DD", já validado), em dias de Brasília. */
export async function getProfessionalPanelService(input: {
  salonId: string
  from: string
  to: string
}): Promise<ProfessionalPanelReport> {
  const appointmentDay = sql`(${appointments.date} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

  const [team, sold, booked, rules] = await Promise.all([
    db
      .select({ id: professionals.id, name: professionals.name, isActive: professionals.isActive })
      .from(professionals)
      .where(eq(professionals.salonId, input.salonId))
      .orderBy(asc(professionals.name)),
    listSoldItemsService(input),
    // O que ocupou a agenda: tudo menos o cancelado. Falta conta (o horário ficou
    // reservado). Bloqueio de horário (serviço de sistema) não é atendimento.
    db
      .select({
        professionalId: appointments.professionalId,
        minutes: sql<number>`(extract(epoch from (${appointments.endTime} - ${appointments.date})) / 60)::int`,
      })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          eq(appointments.salonId, input.salonId),
          ne(appointments.status, "cancelled"),
          eq(services.isSystem, false),
          sql`${appointmentDay} BETWEEN ${input.from}::date AND ${input.to}::date`
        )
      )
      .limit(PANEL_APPOINTMENT_ROWS + 1),
    db
      .select({
        professionalId: availability.professionalId,
        dayOfWeek: availability.dayOfWeek,
        startTime: availability.startTime,
        endTime: availability.endTime,
        isBreak: availability.isBreak,
      })
      .from(availability)
      .innerJoin(professionals, eq(professionals.id, availability.professionalId))
      .where(eq(professionals.salonId, input.salonId)),
  ])

  const panel = buildProfessionalPanel({
    professionals: team,
    items: sold.items.map((item) => ({
      professionalId: item.professionalId,
      saleId: item.saleId,
      customerId: item.customerId,
      kind: item.kind,
      totalCents: item.totalCents,
    })),
    appointments: booked.slice(0, PANEL_APPOINTMENT_ROWS).map((row) => ({
      professionalId: row.professionalId,
      minutes: Number(row.minutes),
    })),
    availability: rules.map((rule) => ({ ...rule, startTime: String(rule.startTime), endTime: String(rule.endTime) })),
    from: input.from,
    to: input.to,
  })

  return { ...panel, truncated: sold.truncated || booked.length > PANEL_APPOINTMENT_ROWS }
}
