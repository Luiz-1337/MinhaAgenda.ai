import {
  db,
  customers,
  campaignMessages,
  retentionResponseAudit,
  and,
  eq,
  sql,
} from "@repo/db"
import {
  IRetentionRepository,
  InactiveCustomerRow,
  FindInactiveOptions,
  RecentRetentionInfo,
  FlagSuspectedOptOutInput,
  RetentionAuditRow,
  SetSentimentInput,
  MarkOptOutInput,
  MarkOptOutResult,
} from "../../domain/repositories/IRetentionRepository"
import { InMemoryCache } from "../cache"

const RECENT_AI_TTL_MS = 60 * 60 * 1000 // 60 minutes — tolerated staleness inside 72h window

/**
 * Drizzle implementation of IRetentionRepository.
 *
 * Heavy queries use raw SQL (db.execute(sql`...`)) because:
 *  - LEFT JOIN LATERAL with aggregation is awkward in Drizzle's query builder
 *  - Strict keyset pagination needs tuple comparison
 *  - Partial indexes (active customers, recent AI messages) require careful predicates
 */
export class DrizzleRetentionRepository implements IRetentionRepository {
  private recentAiCache = new InMemoryCache<RecentRetentionInfo | null>(RECENT_AI_TTL_MS)

  async findInactive(opts: FindInactiveOptions): Promise<InactiveCustomerRow[]> {
    const {
      salonId,
      minDaysSinceVisit,
      defaultCycleDays,
      cooldownDays,
      limit,
      cursor,
    } = opts

    const cursorLastVisit = cursor?.lastVisitAt ?? null
    const cursorCustomerId = cursor?.customerId ?? null

    // The keyset predicate: produce rows that come AFTER the cursor in
    // ORDER BY last_visit DESC NULLS LAST, customer_id ASC.
    //
    //   no cursor                 -> no extra predicate
    //   cursor with non-null T    -> (lv < T) OR (lv = T AND id > cid) OR (lv IS NULL)
    //   cursor with null T        -> (lv IS NULL AND id > cid)
    const result = await db.execute(sql`
      with last_visit as (
        select
          a.client_id,
          a.date as last_visit_at,
          a.service_id,
          a.professional_id,
          row_number() over (
            partition by a.client_id
            order by a.date desc, a.id desc
          ) as rn
        from appointments a
        where a.salon_id = ${salonId}
          and a.status = 'completed'
      )
      select
        c.id as customer_id,
        c.salon_id,
        c.name,
        c.phone,
        lv.last_visit_at,
        lv.service_id as last_service_id,
        s.name as last_service_name,
        lv.professional_id as last_professional_id,
        p.name as last_professional_name,
        coalesce(s.average_cycle_days, ${defaultCycleDays}::int) as cycle_days_used,
        case
          when lv.last_visit_at is null then null
          else extract(day from now() - lv.last_visit_at)::int
        end as days_since_visit
      from customers c
      left join last_visit lv on lv.client_id = c.id and lv.rn = 1
      left join services s on s.id = lv.service_id
      left join professionals p on p.id = lv.professional_id
      where c.salon_id = ${salonId}
        and c.opted_out_at is null
        and (
          lv.last_visit_at is null
          or lv.last_visit_at < now() - make_interval(
            days => greatest(${minDaysSinceVisit}::int, coalesce(s.average_cycle_days, ${defaultCycleDays}::int))
          )
        )
        and not exists (
          select 1 from campaign_messages cm
          where cm.customer_id = c.id
            and cm.generated_by_ai = true
            and cm.sent_at >= now() - make_interval(days => ${cooldownDays}::int)
        )
        and (
          ${cursor === undefined ? sql`true` :
            cursorLastVisit === null
              ? sql`(lv.last_visit_at is null and c.id > ${cursorCustomerId})`
              : sql`(
                  (lv.last_visit_at is not null and lv.last_visit_at < ${cursorLastVisit})
                  or (lv.last_visit_at = ${cursorLastVisit} and c.id > ${cursorCustomerId})
                  or (lv.last_visit_at is null)
                )`}
        )
      order by lv.last_visit_at desc nulls last, c.id asc
      limit ${limit}
    `)

    return result.map((row): InactiveCustomerRow => ({
      customerId: String(row.customer_id),
      salonId: String(row.salon_id),
      name: String(row.name),
      phone: String(row.phone),
      lastVisitAt: row.last_visit_at ? new Date(String(row.last_visit_at)) : null,
      lastServiceId: row.last_service_id ? String(row.last_service_id) : null,
      lastServiceName: row.last_service_name ? String(row.last_service_name) : null,
      lastProfessionalId: row.last_professional_id ? String(row.last_professional_id) : null,
      lastProfessionalName: row.last_professional_name ? String(row.last_professional_name) : null,
      cycleDaysUsed: Number(row.cycle_days_used),
      daysSinceVisit: row.days_since_visit === null ? null : Number(row.days_since_visit),
    }))
  }

  async hasRecentAiMessage(
    customerId: string,
    hoursWindow: number
  ): Promise<RecentRetentionInfo | null> {
    const cacheKey = `${customerId}:${hoursWindow}`
    const cached = this.recentAiCache.get(cacheKey)
    if (cached !== undefined) return cached

    const result = await db.execute(sql`
      select id, sent_at
      from campaign_messages
      where customer_id = ${customerId}
        and generated_by_ai = true
        and status = 'sent'
        and sent_at >= now() - make_interval(hours => ${hoursWindow}::int)
      order by sent_at desc
      limit 1
    `)

    if (!result.length) {
      this.recentAiCache.set(cacheKey, null)
      return null
    }

    const row = result[0]
    const info: RecentRetentionInfo = {
      campaignMessageId: String(row.id),
      sentAt: new Date(String(row.sent_at)),
    }
    this.recentAiCache.set(cacheKey, info)
    return info
  }

  async markOptOut(input: MarkOptOutInput): Promise<MarkOptOutResult> {
    // Phone normalization is brittle: customers may exist in DB with "+5511...",
    // "5511...", "11..." (Maria/Jorge/Luiz Guilherme are all the same human number
    // duplicated in different formats). Compare on digits-only to match any of them.
    const digitsOnly = input.phone.replace(/\D/g, "")
    if (!digitsOnly) {
      throw new Error(`Invalid phone for opt-out: salon=${input.salonId}`)
    }

    const matches = await db.execute(sql`
      SELECT id, opted_out_at
      FROM customers
      WHERE salon_id = ${input.salonId}
        AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digitsOnly}
    `)

    if (!matches.length) {
      throw new Error(`Customer not found for opt-out: salon=${input.salonId}`)
    }

    const now = new Date()
    const ids: string[] = matches.map((row) => String(row.id))
    const alreadyOptedOut = matches.every((row) => row.opted_out_at !== null)
    const firstOptedAt = matches.find((row) => row.opted_out_at !== null)?.opted_out_at
      ? new Date(String(matches.find((row) => row.opted_out_at !== null)!.opted_out_at))
      : null

    if (alreadyOptedOut && firstOptedAt) {
      return {
        customerId: ids[0],
        optedOutAt: firstOptedAt,
        alreadyOptedOut: true,
      }
    }

    // Update all duplicates with this number — they're the same human.
    await db.execute(sql`
      UPDATE customers
      SET opted_out_at = ${now.toISOString()}::timestamp,
          opt_out_reason = ${input.reason},
          opt_out_source = ${input.source},
          updated_at = ${now.toISOString()}::timestamp
      WHERE id = ANY(${ids}::uuid[])
        AND opted_out_at IS NULL
    `)

    return {
      customerId: ids[0],
      optedOutAt: now,
      alreadyOptedOut: false,
    }
  }

  async clearOptOut(salonId: string, phone: string): Promise<boolean> {
    const digitsOnly = phone.replace(/\D/g, "")
    if (!digitsOnly) return false

    const result = await db.execute(sql`
      UPDATE customers
      SET opted_out_at = NULL,
          opt_out_reason = NULL,
          opt_out_source = NULL,
          updated_at = now()
      WHERE salon_id = ${salonId}
        AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digitsOnly}
      RETURNING id
    `)

    return result.length > 0
  }

  async flagSuspectedOptOut(input: FlagSuspectedOptOutInput): Promise<string> {
    const [row] = await db
      .insert(retentionResponseAudit)
      .values({
        salonId: input.salonId,
        customerId: input.customerId,
        phone: input.phone,
        retentionCampaignMessageId: input.retentionCampaignMessageId,
        responseBody: input.responseBody,
        softSignalMatch: true,
      })
      .returning({ id: retentionResponseAudit.id })

    return row.id
  }

  async findUnreviewedAudits(
    hoursWindow: number,
    limit: number
  ): Promise<RetentionAuditRow[]> {
    const result = await db.execute(sql`
      select id, salon_id, customer_id, phone, retention_campaign_message_id, response_body, created_at
      from retention_response_audit
      where reviewed_at is null
        and created_at >= now() - make_interval(hours => ${hoursWindow}::int)
      order by created_at asc
      limit ${limit}
    `)

    return result.map((row) => ({
      id: String(row.id),
      salonId: String(row.salon_id),
      customerId: row.customer_id ? String(row.customer_id) : null,
      phone: String(row.phone),
      retentionCampaignMessageId: row.retention_campaign_message_id
        ? String(row.retention_campaign_message_id)
        : null,
      responseBody: String(row.response_body),
      createdAt: new Date(String(row.created_at)),
    }))
  }

  async setAuditSentiment(input: SetSentimentInput): Promise<void> {
    await db
      .update(retentionResponseAudit)
      .set({
        sentimentLabel: input.label,
        sentimentConfidence: input.confidence.toFixed(2),
        reviewedAt: new Date(),
        actionTaken: input.actionTaken ?? undefined,
      })
      .where(eq(retentionResponseAudit.id, input.auditId))
  }

  async countAiMessagesSentToday(salonId: string): Promise<number> {
    const result = await db.execute(sql`
      select count(*)::int as cnt
      from campaign_messages cm
      inner join campaigns c on c.id = cm.campaign_id
      where c.salon_id = ${salonId}
        and cm.generated_by_ai = true
        and cm.sent_at::date = current_date
    `)
    return Number(result[0]?.cnt ?? 0)
  }
}
