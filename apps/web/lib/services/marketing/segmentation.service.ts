/**
 * Serviço para segmentação de leads/customers para campanhas
 *
 * Uma SQL por chamada (contagem ou página), no molde de
 * `packages/mcp-server/src/infrastructure/database/DrizzleRetentionRepository.ts:55-115`:
 * CTE de última visita com window function, join por `lv.client_id = c.id` e paginação
 * keyset. O join é por `customers.id` porque `appointments.client_id` é FK de
 * `customers.id` (`packages/db/src/schema.ts:293`) — a versão anterior buscava `profiles`
 * por telefone e usava `profile.id` nesse where (espaços de UUID distintos, resultado
 * sempre vazio), além de fazer 2-3 queries por cliente dentro de um `for`.
 */

import { db, sql } from "@repo/db"
import { logger } from "../../infra/logger"

export interface SegmentationCriteria {
  distanceRadius?: string // "all" | "1km" | "5km" | "10km" — não aplicado (sem geolocalização)
  lastVisit?: string // "any" | "30days" | "60days" | "never"
  gender?: string // "all" | "male" | "female" — não aplicado (sem coluna em customers)
  serviceIds?: string[] // IDs de serviços já consumidos pelo cliente
}

export interface SegmentedLead {
  id: string
  type: 'customer' | 'lead'
  name: string
  phone: string
  email: string | null
  customerId?: string
  leadId?: string
  lastVisitDate: Date | null
  lastServiceName: string | null
}

export interface SegmentationCursor {
  /** Chave de última visita como texto UTC vindo do banco; null = nunca visitou. */
  lastVisitKey: string | null
  customerId: string
}

export interface SegmentedLeadsPage {
  leads: SegmentedLead[]
  nextCursor: SegmentationCursor | null
}

/** Tamanho de página do keyset ao materializar o público inteiro. */
const PAGE_SIZE = 500
/** Teto de destinatários por campanha — evita materializar base inteira sem limite. */
const MAX_LEADS = 5000

/**
 * "Visita" = agendamento no passado que não foi cancelado.
 *
 * Decisão do dono (26/07/2026): não copiar o `status = 'completed'` do motor de retenção
 * (`DrizzleRetentionRepository.ts:68`), porque nenhum código de produto grava esse status
 * e cancelar apaga a linha (`packages/db/src/services/appointments.ts:609`) — filtrar por
 * 'completed' devolveria zero de novo, que é justamente o sintoma que se está corrigindo.
 * Quando a Peça 1 do roadmap de CRM existir (`completed_at`, `no_show`), apertar aqui.
 */
function visited(alias: string) {
  const a = sql.raw(alias)
  return sql`${a}.status <> 'cancelled' and ${a}.date < now()`
}

/** CTE com a última visita por cliente do salão. */
function lastVisitCte(salonId: string) {
  return sql`
    last_visit as (
      select
        a.client_id,
        a.date as last_visit_at,
        a.service_id,
        row_number() over (
          partition by a.client_id
          order by a.date desc, a.id desc
        ) as rn
      from appointments a
      where a.salon_id = ${salonId}
        and ${visited("a")}
    )
  `
}

/**
 * Filtros do público. Referenciam apenas `c` (customers) e `lv` (última visita),
 * então servem igual para a contagem e para a página.
 */
function segmentationFilters(criteria: SegmentationCriteria, salonId: string) {
  const conditions = [
    sql`c.salon_id = ${salonId}`,
    // Exclui placeholders internos (ex.: contato "Google Calendar") de campanhas.
    sql`c.is_system = false`,
    // Opt-out é regra do motor, não de cada chamador.
    sql`c.opted_out_at is null`,
  ]

  if (criteria.lastVisit === "never") {
    conditions.push(sql`lv.last_visit_at is null`)
  } else if (criteria.lastVisit === "30days" || criteria.lastVisit === "60days") {
    const days = criteria.lastVisit === "30days" ? 30 : 60
    conditions.push(
      sql`lv.last_visit_at is not null
        and lv.last_visit_at < now() - make_interval(days => ${days}::int)`
    )
  }

  // "Serviço Realizado" = qualquer serviço já consumido (decisão do dono, 26/07/2026),
  // não apenas o último. Usa o índice appt_client_idx (schema.ts:309).
  const serviceIds = (criteria.serviceIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0
  )
  if (serviceIds.length > 0) {
    conditions.push(sql`exists (
      select 1
      from appointments a2
      where a2.client_id = c.id
        and a2.salon_id = ${salonId}
        and ${visited("a2")}
        and a2.service_id in ${serviceIds}
    )`)
  }

  return sql.join(conditions, sql` and `)
}

/**
 * Predicado keyset: linhas DEPOIS do cursor em
 * `order by lv.last_visit_at desc nulls last, c.id asc`.
 */
function keysetAfter(cursor: SegmentationCursor | null) {
  if (!cursor) return sql`true`

  if (cursor.lastVisitKey === null) {
    return sql`(lv.last_visit_at is null and c.id > ${cursor.customerId})`
  }

  return sql`(
    (lv.last_visit_at is not null and lv.last_visit_at < ${cursor.lastVisitKey}::timestamp)
    or (lv.last_visit_at = ${cursor.lastVisitKey}::timestamp and c.id > ${cursor.customerId})
    or lv.last_visit_at is null
  )`
}

export class SegmentationService {
  /**
   * Uma página do público segmentado (keyset). Uma única SQL.
   */
  static async getSegmentedLeadsPage(
    criteria: SegmentationCriteria,
    salonId: string,
    options: { limit: number; cursor?: SegmentationCursor | null }
  ): Promise<SegmentedLeadsPage> {
    const limit = Math.max(1, Math.min(options.limit, PAGE_SIZE))
    const cursor = options.cursor ?? null

    const rows = await db.execute(sql`
      with ${lastVisitCte(salonId)}
      select
        c.id as customer_id,
        c.name,
        c.phone,
        c.email,
        -- Texto UTC explícito: serve de cursor e evita depender do parse de
        -- timestamp sem timezone do driver.
        to_char(lv.last_visit_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') as last_visit_key,
        s.name as last_service_name
      from customers c
      left join last_visit lv on lv.client_id = c.id and lv.rn = 1
      left join services s on s.id = lv.service_id
      where ${segmentationFilters(criteria, salonId)}
        and ${keysetAfter(cursor)}
      order by lv.last_visit_at desc nulls last, c.id asc
      limit ${limit}
    `)

    const leads = rows.map((row): SegmentedLead => {
      const lastVisitKey = row.last_visit_key ? String(row.last_visit_key) : null

      return {
        id: String(row.customer_id),
        type: 'customer',
        name: String(row.name),
        phone: String(row.phone),
        email: row.email ? String(row.email) : null,
        customerId: String(row.customer_id),
        lastVisitDate: lastVisitKey ? new Date(`${lastVisitKey}Z`) : null,
        lastServiceName: row.last_service_name ? String(row.last_service_name) : null,
      }
    })

    const lastRow = rows.length === limit ? rows[rows.length - 1] : undefined
    const nextCursor: SegmentationCursor | null = lastRow
      ? {
          lastVisitKey: lastRow.last_visit_key ? String(lastRow.last_visit_key) : null,
          customerId: String(lastRow.customer_id),
        }
      : null

    return { leads, nextCursor }
  }

  /**
   * Público segmentado inteiro (para o disparo), materializado por keyset.
   * `options.limit` corta a lista — use para preview em tela.
   */
  static async getSegmentedLeads(
    criteria: SegmentationCriteria,
    salonId: string,
    options?: { limit?: number }
  ): Promise<SegmentedLead[]> {
    const hardLimit = Math.max(1, Math.min(options?.limit ?? MAX_LEADS, MAX_LEADS))
    const leads: SegmentedLead[] = []
    let cursor: SegmentationCursor | null = null

    while (leads.length < hardLimit) {
      const page = await SegmentationService.getSegmentedLeadsPage(criteria, salonId, {
        limit: Math.min(PAGE_SIZE, hardLimit - leads.length),
        cursor,
      })

      leads.push(...page.leads)

      if (!page.nextCursor) {
        return leads
      }

      cursor = page.nextCursor
    }

    // Truncou: quem chamou precisa saber que a lista não é o público inteiro.
    logger.warn(
      { salonId, hardLimit, criteria },
      "Segmentação truncada no teto de destinatários"
    )

    return leads
  }

  /**
   * Contagem do público (para o preview). Uma única SQL — não materializa linhas.
   */
  static async getSegmentedLeadsCount(
    criteria: SegmentationCriteria,
    salonId: string
  ): Promise<number> {
    const rows = await db.execute(sql`
      with ${lastVisitCte(salonId)}
      select count(*)::int as total
      from customers c
      left join last_visit lv on lv.client_id = c.id and lv.rn = 1
      where ${segmentationFilters(criteria, salonId)}
    `)

    return Number(rows[0]?.total ?? 0)
  }
}
