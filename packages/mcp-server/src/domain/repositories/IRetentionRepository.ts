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
  /**
   * Exige visita CONHECIDA para o cliente ser considerado inativo.
   *
   * "Cliente inativo" significa "veio e sumiu", não "nunca veio". A versão
   * anterior aceitava `lastVisitAt IS NULL` no LEFT JOIN, e como nenhum código de
   * produto grava `appointments.status='completed'`, a CTE de última visita vinha
   * vazia para TODO mundo — a query devolvia a base inteira do salão, com
   * `daysSinceVisit` nulo (que o dispatcher lê como `?? 0` e viraria "faz 0 dias
   * que você não vem" na mensagem da IA).
   *
   * O que segurava o disparo era só `salons.ai_retention_enabled` (default false).
   * Com esta trava, a população cresce organicamente conforme os atendimentos
   * passam a ser fechados, em vez de estourar de uma vez.
   */
  requireKnownVisit: boolean
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
   * Returns inactive customers for a salon using a last-visit CTE over
   * appointments, ordered by (lastVisitAt DESC, id ASC) with strict keyset
   * pagination. With `requireKnownVisit` (the only value production uses),
   * customers with no known visit are excluded — see FindInactiveOptions.
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
