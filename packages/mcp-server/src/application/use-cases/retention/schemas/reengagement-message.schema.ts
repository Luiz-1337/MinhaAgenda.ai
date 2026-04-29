import { z } from "zod"

/**
 * Validated output of the LLM call inside GenerateReengagementMessageUseCase.
 * Hard length cap protects against runaway generations and keeps WhatsApp UX clean.
 */
export const ReengagementMessageSchema = z.object({
  mensagem: z.string().min(20).max(220),
})

export type ReengagementMessageOutput = z.infer<typeof ReengagementMessageSchema>

export function parseReengagementMessage(raw: unknown): ReengagementMessageOutput {
  return ReengagementMessageSchema.parse(raw)
}

/**
 * Output of the sentiment classifier (Camada 3 cron).
 */
export const RetentionSentimentSchema = z.object({
  label: z.enum(["annoyed", "neutral", "positive"]),
  confidence: z.number().min(0).max(1),
})

export type RetentionSentimentOutput = z.infer<typeof RetentionSentimentSchema>

export function parseRetentionSentiment(raw: unknown): RetentionSentimentOutput {
  return RetentionSentimentSchema.parse(raw)
}
