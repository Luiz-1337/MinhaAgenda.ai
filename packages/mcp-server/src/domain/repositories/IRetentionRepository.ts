/**
 * Retention repository — exposes queries and writes specific to the
 * AI retention pipeline (inactive customer detection, opt-out tracking,
 * dispatch idempotency and audit trail).
 *
 * Implementations live in infrastructure/database.
 */

export interface InactiveCustomerRow {
  customerId: string
  salonId: string
  name: string
  phone: string
  lastVisitAt: Date | null
  lastServiceId: string | null
  lastServiceName: string | null
  lastProfessionalId: string | null
  lastProfessionalName: string | null
  cycleDaysUsed: number
  daysSinceVisit: number | null
}

export interface InactiveCursor {
  lastVisitAt: Date | null
  customerId: string
}

export interface FindInactiveOptions {
  salonId: string
  minDaysSinceVisit: number
  defaultCycleDays: number
  cooldownDays: number
  limit: number
  cursor?: InactiveCursor
}

export interface RecentRetentionInfo {
  campaignMessageId: string
  sentAt: Date
}

export interface FlagSuspectedOptOutInput {
  salonId: string
  customerId: string | null
  phone: string
  responseBody: string
  retentionCampaignMessageId: string | null
}

export interface RetentionAuditRow {
  id: string
  salonId: string
  customerId: string | null
  phone: string
  retentionCampaignMessageId: string | null
  responseBody: string
  createdAt: Date
}

export interface SetSentimentInput {
  auditId: string
  label: 'annoyed' | 'neutral' | 'positive'
  confidence: number
  actionTaken: 'auto_opt_out' | 'dismissed' | 'manual_opt_out' | null
}

export interface MarkOptOutInput {
  salonId: string
  phone: string
  reason: string
  source: 'keyword' | 'manual' | 'admin'
}

export interface MarkOptOutResult {
  customerId: string
  optedOutAt: Date
  alreadyOptedOut: boolean
}

export interface IRetentionRepository {
  /**
   * Returns inactive customers for a salon using LEFT JOIN LATERAL on
   * appointments.completed, ordered by (lastVisitAt DESC NULLS LAST, id ASC)
   * with strict keyset pagination.
   */
  findInactive(opts: FindInactiveOptions): Promise<InactiveCustomerRow[]>

  /**
   * Hot-path check for the worker — was the customer recently sent an
   * AI-generated retention message? Cached for 60 min (TTL).
   */
  hasRecentAiMessage(customerId: string, hoursWindow: number): Promise<RecentRetentionInfo | null>

  /**
   * Idempotent opt-out write. If the customer is already opted out,
   * returns the existing timestamp.
   */
  markOptOut(input: MarkOptOutInput): Promise<MarkOptOutResult>

  /** Reactivates a previously opted-out customer. */
  clearOptOut(salonId: string, phone: string): Promise<boolean>

  /** Persists a soft-signal flag for human/LLM review. */
  flagSuspectedOptOut(input: FlagSuspectedOptOutInput): Promise<string>

  /** Cron audit: reads unreviewed flags from the last N hours. */
  findUnreviewedAudits(hoursWindow: number, limit: number): Promise<RetentionAuditRow[]>

  /** Persists sentiment classification + action decision for an audit row. */
  setAuditSentiment(input: SetSentimentInput): Promise<void>

  /** Returns count of AI messages already sent to this salon today. */
  countAiMessagesSentToday(salonId: string): Promise<number>
}
