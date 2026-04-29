/**
 * Last-line defense against unsafe AI-generated retention messages.
 *
 * v1: simple regex blocklist for content that should never reach a customer
 * (slurs, mentions of drugs/alcohol/violence, fake price promises, etc).
 * If a message matches, the dispatcher falls back to the static template.
 *
 * Keep this list short and focused — broader moderation lives upstream
 * (system prompt restrictions + zod size limit).
 */

const BLOCKED_PATTERNS: RegExp[] = [
  // Common Brazilian slurs / hostile language (case-insensitive)
  /\b(?:idiota|imbecil|burro|burra|otario|otaria|estupido|estupida)\b/i,
  // Hard discount promises (we cannot guarantee prices)
  /\b\d{1,3}\s*%\s*(?:off|de\s+desconto)\b/i,
  /\bgr[aá]tis\b/i,
  /\br\$\s*\d/i,
  // Aggressive urgency / scammy wording
  /\b(?:urgentissim|ultim[oa]s?\s+vagas?|imperdivel|so\s+hoje)\b/i,
  // Inappropriate topics
  /\b(?:bebida|alcool|cerveja|drinks?)\b/i,
  /\b(?:droga|maconha|cocaina|crack)\b/i,
]

export interface ContentFilterResult {
  safe: boolean
  matchedPattern?: string
}

export function checkRetentionMessageSafety(message: string): ContentFilterResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      return { safe: false, matchedPattern: pattern.source }
    }
  }
  return { safe: true }
}
