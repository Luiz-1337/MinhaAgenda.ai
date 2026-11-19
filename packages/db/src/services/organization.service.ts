import { and, asc, eq, inArray, ne, sql } from "drizzle-orm"

import { appointments, customers, db, professionals, sales, salons, services } from "../index"
import {
  buildOrganizationUnits,
  groupOrganizationMembers,
  type OrganizationMember,
  type OrganizationUnits,
} from "../domain/organization"
import { toCents } from "../domain/sales"

/**
 * Organização (multiunidade) — docs/ROADMAP.md, fase 9, fatia 9g, caminho A.
 *
 * ESTE É O ÚNICO SERVIÇO QUE LÊ MAIS DE UM SALÃO DE UMA VEZ. A regra do sistema é
 * "toda consulta leva `salon_id`"; aqui ela vira "toda consulta leva os salões
 * DESTE DONO":
 *
 *   - a lista de salões sai SEMPRE de `salons.owner_id = ownerId`, lida aqui
 *     dentro — nunca chega de fora uma lista de ids de salão;
 *   - `ownerId` é o usuário da sessão, passado pela Server Action;
 *   - ser gerente ou profissional de um salão não o põe na lista: só ser o dono.
 *
 * Só leitura. Não há nada compartilhado entre as unidades: cada número é contado
 * dentro do seu salão e posto lado a lado.
 */

const brazilDay = (column: unknown) =>
  sql`(${column} AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date`

/** Os salões de que a pessoa é DONA, por nome. */
export async function listOwnedSalonsService(ownerId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: salons.id, name: salons.name })
    .from(salons)
    .where(eq(salons.ownerId, ownerId))
    .orderBy(asc(sql`lower(${salons.name})`))
}

export type OrganizationReport = {
  units: OrganizationUnits
  members: OrganizationMember[]
}

/**
 * As unidades do dono lado a lado, no período `from`–`to` ("YYYY-MM-DD", já
 * validado), e a equipe de todas. NULL = a pessoa não é dona de nenhum salão.
 */
export async function getOrganizationReportService(input: {
  ownerId: string
  from: string
  to: string
}): Promise<OrganizationReport | null> {
  const owned = await listOwnedSalonsService(input.ownerId)
  if (owned.length === 0) return null
  const salonIds = owned.map((salon) => salon.id)

  const [saleRows, appointmentRows, customerRows, team] = await Promise.all([
    db
      .select({
        salonId: sales.salonId,
        sales: sql<number>`count(*)::int`,
        revenue: sql<string>`coalesce(sum(${sales.total}), 0)::text`,
        buyers: sql<number>`count(distinct ${sales.customerId})::int`,
      })
      .from(sales)
      .where(
        and(
          inArray(sales.salonId, salonIds),
          eq(sales.status, "invoiced"),
          sql`${brazilDay(sales.saleDate)} BETWEEN ${input.from}::date AND ${input.to}::date`
        )
      )
      .groupBy(sales.salonId),
    db
      .select({ salonId: appointments.salonId, total: sql<number>`count(*)::int` })
      .from(appointments)
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .where(
        and(
          inArray(appointments.salonId, salonIds),
          ne(appointments.status, "cancelled"),
          eq(services.isSystem, false),
          sql`${brazilDay(appointments.date)} BETWEEN ${input.from}::date AND ${input.to}::date`
        )
      )
      .groupBy(appointments.salonId),
    db
      .select({ salonId: customers.salonId, total: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(inArray(customers.salonId, salonIds), eq(customers.isSystem, false)))
      .groupBy(customers.salonId),
    db
      .select({
        id: professionals.id,
        salonId: professionals.salonId,
        name: professionals.name,
        email: professionals.email,
        role: professionals.role,
        isActive: professionals.isActive,
        userId: professionals.userId,
        personKey: professionals.personKey,
      })
      .from(professionals)
      .where(inArray(professionals.salonId, salonIds))
      .orderBy(asc(professionals.name)),
  ])

  const salonName = new Map(owned.map((salon) => [salon.id, salon.name]))

  const units = buildOrganizationUnits(
    owned.map((salon) => {
      const sale = saleRows.find((row) => row.salonId === salon.id)
      return {
        salonId: salon.id,
        name: salon.name,
        sales: Number(sale?.sales ?? 0),
        revenueCents: toCents(sale?.revenue ?? "0") ?? 0,
        buyers: Number(sale?.buyers ?? 0),
        appointments: Number(appointmentRows.find((row) => row.salonId === salon.id)?.total ?? 0),
        customers: Number(customerRows.find((row) => row.salonId === salon.id)?.total ?? 0),
        professionals: team.filter((member) => member.salonId === salon.id && member.isActive).length,
      }
    })
  )

  const members = groupOrganizationMembers(
    team.map((member) => ({ ...member, salonName: salonName.get(member.salonId) ?? "" }))
  )

  return { units, members }
}
