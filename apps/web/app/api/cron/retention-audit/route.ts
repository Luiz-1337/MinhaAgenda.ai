/**
 * Retention Audit Cron — Camada 3 do opt-out.
 *
 * Daily pass over `retention_response_audit` rows that were flagged by the
 * worker (Camada 2 soft signals) and never reviewed. For each flagged row:
 *  - LLM classifies the response sentiment (annoyed | neutral | positive)
 *  - If `annoyed` AND confidence >= threshold → auto-opt-out + log
 *  - Else → mark reviewed/dismissed with the classifier output for human review
 *
 * Failures on individual rows do not abort the batch. Cron retries tomorrow.
 */

import { logger } from '@repo/db'
import {
  container,
  registerProviders,
  registerAiResponsesRunner,
  TOKENS,
  ClassifyRetentionResponseUseCase,
} from '@repo/mcp-server'
import { NextRequest } from 'next/server'
import { OpenAiResponsesRunnerAdapter } from '@/lib/services/ai/openai-responses-runner.adapter'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { retentionConfig } from '@/lib/config/retention'

export const runtime = 'nodejs'
export const maxDuration = 300

let providersBootstrapped = false
function ensureBootstrapped(): void {
  if (providersBootstrapped) return
  if (!container.has(TOKENS.AppointmentRepository)) {
    registerProviders(container)
  }
  if (!container.has(TOKENS.AiResponsesRunner)) {
    registerAiResponsesRunner(container, new OpenAiResponsesRunnerAdapter())
  }
  providersBootstrapped = true
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  if (retentionConfig.disabled) {
    return Response.json({ disabled: true })
  }

  try {
    ensureBootstrapped()
    const useCase = container.resolve<ClassifyRetentionResponseUseCase>(
      TOKENS.ClassifyRetentionResponseUseCase
    )

    const result = await useCase.execute({
      hoursWindow: 24,
      limit: 200,
      autoOptOutConfidence: retentionConfig.autoOptOutConfidence,
      model: retentionConfig.classificationModel,
    })

    if (!result.success) {
      logger.error('Retention audit failed', { err: result.error.message }, result.error as Error)
      return new Response('Retention audit failed', { status: 500 })
    }

    return Response.json({
      totalReviewed: result.data.totalReviewed,
      autoOptedOut: result.data.autoOptedOut,
      dismissed: result.data.dismissed,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Retention audit failed', { error: errorMessage }, error as Error)
    return new Response('Retention audit failed', { status: 500 })
  }
}
