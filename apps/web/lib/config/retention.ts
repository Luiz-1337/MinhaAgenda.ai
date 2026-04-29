/**
 * Retention AI feature flags and tunables.
 *
 * All values come from env vars and are read once per server cold start.
 * Defaults are intentionally conservative — opt-in via allowlist.
 */

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )
}

function parseInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

function parseBool(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined) return fallback
  return raw === 'true' || raw === '1' || raw === 'yes'
}

export const retentionConfig = {
  /** Global kill switch. true = bypass entire AI retention pipeline. */
  disabled: parseBool(process.env.RETENTION_AI_DISABLED, false),

  /** Salons enabled for AI retention. Empty = none. */
  salonAllowlist: parseAllowlist(process.env.RETENTION_AI_SALON_ALLOWLIST),

  /** Fallback inactivity cycle when service.average_cycle_days is NULL. */
  defaultCycleDays: parseInt(process.env.RETENTION_DEFAULT_CYCLE_DAYS, 30),

  /** Diurnal dispatch window (Brazilian local hours, 0-23). */
  dispatchWindowStartHour: parseInt(process.env.RETENTION_DISPATCH_WINDOW_START_HOUR, 9),
  dispatchWindowEndHour: parseInt(process.env.RETENTION_DISPATCH_WINDOW_END_HOUR, 18),

  /** Hard daily cap of AI retention messages per salon. */
  maxPerSalonPerDay: parseInt(process.env.RETENTION_AI_MAX_PER_SALON_PER_DAY, 50),

  /** Minimum days between AI retention messages to the same customer. */
  cooldownDays: parseInt(process.env.RETENTION_AI_COOLDOWN_DAYS, 14),

  /** Concurrency limit when generating LLM messages in batch. */
  generationConcurrency: parseInt(process.env.RETENTION_AI_GEN_CONCURRENCY, 8),

  /** Page size for FindInactiveCustomersUseCase loop. */
  inactivePageLimit: parseInt(process.env.RETENTION_AI_PAGE_LIMIT, 50),

  /** OpenAI model for message generation. */
  generationModel: process.env.RETENTION_AI_MODEL || 'gpt-4o-mini',

  /** OpenAI model for sentiment classification (cron audit). */
  classificationModel: process.env.RETENTION_AI_CLASSIFY_MODEL || 'gpt-4o-mini',

  /** Confidence threshold for auto-opt-out from sentiment classifier. */
  autoOptOutConfidence: parseFloat(process.env.RETENTION_AUTO_OPT_OUT_CONFIDENCE || '0.8'),

  /** Random jitter (minutes) added per scheduled message. */
  jitterMinMinutes: parseInt(process.env.RETENTION_JITTER_MIN_MINUTES, 2),
  jitterMaxMinutes: parseInt(process.env.RETENTION_JITTER_MAX_MINUTES, 15),
} as const

export type RetentionConfig = typeof retentionConfig

export function isSalonAllowlisted(salonId: string): boolean {
  if (retentionConfig.disabled) return false
  return retentionConfig.salonAllowlist.has(salonId)
}
