/**
 * AI Retention Dispatcher
 *
 * Per-step branch executed by /api/cron/marketing-dispatcher when
 * `recoverySteps.useAiGeneration = true` AND the salon is on the
 * RETENTION_AI_SALON_ALLOWLIST.
 *
 * Pipeline:
 *  1. Find inactive customers (appointments-based, opt-out aware, cooldown enforced)
 *  2. Generate per-customer message via LLM in parallel batches (pLimit)
 *  3. Run content filter; on fail, fall back to step.messageTemplate
 *  4. Insert campaign_messages with sent_at distributed in the diurnal window
 *     (random base + per-customer jitter), idempotent via UNIQUE partial index
 *
 * Returns aggregate counters for the cron route response.
 */

import {
  db,
  recoveryFlows,
  recoverySteps,
  campaigns,
  campaignMessages,
  agents,
  salons,
  and,
  eq,
  sql,
  logger,
} from '@repo/db'
import {
  container,
  registerProviders,
  registerAiResponsesRunner,
  TOKENS,
  FindInactiveCustomersUseCase,
  GenerateReengagementMessageUseCase,
} from '@repo/mcp-server'
import { createHash } from 'node:crypto'
import { OpenAiResponsesRunnerAdapter } from '../ai/openai-responses-runner.adapter'
import { checkRetentionMessageSafety } from '../ai/content-filter.service'
import { retentionConfig, isSalonAllowlisted } from '../../config/retention'

export interface AiRetentionResult {
  scannedSteps: number
  enqueuedCount: number
  fallbackCount: number
  skippedAllowlist: number
  skippedCap: number
  skippedDuplicate: number
}

let providersBootstrapped = false

function ensureProvidersRegistered(): void {
  if (providersBootstrapped) return
  registerProviders(container)
  registerAiResponsesRunner(container, new OpenAiResponsesRunnerAdapter())
  providersBootstrapped = true
}

function hashMessage(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

interface SchedulingPlan {
  scheduledAt: Date
}

/**
 * Builds a diurnal scheduling plan (Brazilian local hours).
 * - Base: today + windowStart
 * - Spread: uniform within [windowStart, windowEnd) per customer
 * - Jitter: additional small offset to avoid bursts on second boundaries
 */
function makeSchedulingPlan(): SchedulingPlan {
  const now = new Date()
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)

  // Brazil is UTC-3; convert window hours to UTC.
  const windowStartUtcHour = retentionConfig.dispatchWindowStartHour + 3
  const windowEndUtcHour = retentionConfig.dispatchWindowEndHour + 3
  const windowStartMs = today.getTime() + windowStartUtcHour * 3600 * 1000
  const windowEndMs = today.getTime() + windowEndUtcHour * 3600 * 1000

  // If we are already past the window end (cron ran late), schedule tomorrow.
  let baseStart = windowStartMs
  let baseEnd = windowEndMs
  if (now.getTime() > windowEndMs) {
    baseStart += 24 * 3600 * 1000
    baseEnd += 24 * 3600 * 1000
  } else if (now.getTime() > windowStartMs) {
    baseStart = now.getTime() + 60_000 // at least 1 min from now
  }

  const baseOffset = randomBetween(0, baseEnd - baseStart)
  const jitterMinMs = retentionConfig.jitterMinMinutes * 60 * 1000
  const jitterMaxMs = retentionConfig.jitterMaxMinutes * 60 * 1000
  const jitterOffset = randomBetween(jitterMinMs, jitterMaxMs)

  return { scheduledAt: new Date(baseStart + baseOffset + jitterOffset) }
}

async function ensureRecoveryCampaign(flow: { id: string; salonId: string; name: string }): Promise<string> {
  const existing = await db.execute(sql`
    select ${campaigns.id} as id
    from ${campaigns}
    where ${campaigns.salonId} = ${flow.salonId}
      and (${campaigns.segmentationCriteria} ->> 'recovery_flow_id') = ${flow.id}
    limit 1
  `)

  const existingId = existing[0]?.id
  if (existingId) {
    return String(existingId)
  }

  const [created] = await db
    .insert(campaigns)
    .values({
      salonId: flow.salonId,
      name: `Recovery Flow: ${flow.name}`,
      description: 'Auto-generated recovery campaign',
      status: 'active',
      segmentationCriteria: { recovery_flow_id: flow.id },
      startsAt: new Date(),
    })
    .returning({ id: campaigns.id })

  return created.id
}

async function getSalonContext(salonId: string): Promise<{ salonName: string; agentTone: string } | null> {
  const salonRow = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true },
  })
  if (!salonRow) return null

  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.salonId, salonId), eq(agents.isActive, true)),
    columns: { tone: true },
  })

  return {
    salonName: salonRow.name,
    agentTone: agent?.tone ?? 'Amigavel e profissional',
  }
}

/**
 * Promise.allSettled batch helper with concurrency limit (pLimit).
 * No external dep; small inline implementation.
 */
async function batchProcess<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn) => Promise<TOut>
): Promise<Array<PromiseSettledResult<TOut>>> {
  const results: Array<PromiseSettledResult<TOut>> = new Array(items.length)
  let cursor = 0

  async function spawn() {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      try {
        const value = await worker(items[idx])
        results[idx] = { status: 'fulfilled', value }
      } catch (reason) {
        results[idx] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => spawn())
  await Promise.all(workers)
  return results
}

export async function runAiRetentionDispatcher(): Promise<AiRetentionResult> {
  const result: AiRetentionResult = {
    scannedSteps: 0,
    enqueuedCount: 0,
    fallbackCount: 0,
    skippedAllowlist: 0,
    skippedCap: 0,
    skippedDuplicate: 0,
  }

  if (retentionConfig.disabled) {
    logger.info('AI retention dispatcher disabled by env')
    return result
  }
  if (retentionConfig.salonAllowlist.size === 0) {
    return result
  }

  ensureProvidersRegistered()

  const findInactive = container.resolve<FindInactiveCustomersUseCase>(
    TOKENS.FindInactiveCustomersUseCase
  )
  const generateMessage = container.resolve<GenerateReengagementMessageUseCase>(
    TOKENS.GenerateReengagementMessageUseCase
  )

  const aiSteps = await db
    .select({
      stepId: recoverySteps.id,
      flowId: recoveryFlows.id,
      salonId: recoveryFlows.salonId,
      flowName: recoveryFlows.name,
      stepOrder: recoverySteps.stepOrder,
      daysAfterInactivity: recoverySteps.daysAfterInactivity,
      messageTemplate: recoverySteps.messageTemplate,
      includeAiCoupon: recoverySteps.includeAiCoupon,
      aiToneOverride: recoverySteps.aiToneOverride,
      aiSkipOptOutFooter: recoverySteps.aiSkipOptOutFooter,
    })
    .from(recoverySteps)
    .innerJoin(recoveryFlows, eq(recoverySteps.recoveryFlowId, recoveryFlows.id))
    .where(
      and(
        eq(recoveryFlows.isActive, true),
        eq(recoverySteps.isActive, true),
        eq(recoverySteps.useAiGeneration, true)
      )
    )

  result.scannedSteps = aiSteps.length

  for (const step of aiSteps) {
    if (!isSalonAllowlisted(step.salonId)) {
      result.skippedAllowlist += 1
      continue
    }

    const ctx = await getSalonContext(step.salonId)
    if (!ctx) {
      logger.warn('Salon not found, skipping AI retention step', { salonId: step.salonId })
      continue
    }

    const sentToday = await db.execute(sql`
      select count(*)::int as cnt
      from ${campaignMessages} cm
      inner join ${campaigns} c on c.id = cm.campaign_id
      where c.salon_id = ${step.salonId}
        and cm.generated_by_ai = true
        and cm.created_at::date = current_date
    `)
    const alreadySentCount = Number(sentToday[0]?.cnt ?? 0)
    const remainingBudget = retentionConfig.maxPerSalonPerDay - alreadySentCount
    if (remainingBudget <= 0) {
      result.skippedCap += 1
      continue
    }

    const inactiveResult = await findInactive.execute({
      salonId: step.salonId,
      daysAfterInactivity: step.daysAfterInactivity,
      defaultCycleDays: retentionConfig.defaultCycleDays,
      cooldownDays: retentionConfig.cooldownDays,
      limit: Math.min(retentionConfig.inactivePageLimit, remainingBudget),
    })

    if (!inactiveResult.success) {
      logger.error('FindInactiveCustomersUseCase failed', {
        salonId: step.salonId,
        stepId: step.stepId,
        err: inactiveResult.error.message,
      })
      continue
    }

    if (inactiveResult.data.items.length === 0) {
      continue
    }

    const campaignId = await ensureRecoveryCampaign({
      id: step.flowId,
      salonId: step.salonId,
      name: step.flowName,
    })

    const generations = await batchProcess(
      inactiveResult.data.items,
      retentionConfig.generationConcurrency,
      async (customer) => {
        const genResult = await generateMessage.execute({
          salonId: step.salonId,
          salonName: ctx.salonName,
          agentTone: ctx.agentTone,
          customerName: customer.name,
          lastServiceName: customer.lastServiceName,
          lastProfessionalName: customer.lastProfessionalName,
          daysSinceVisit: customer.daysSinceVisit ?? 0,
          toneOverride: step.aiToneOverride,
          includeCoupon: step.includeAiCoupon,
          skipOptOutFooter: step.aiSkipOptOutFooter,
          model: retentionConfig.generationModel,
        })

        if (!genResult.success) {
          return { customer, message: step.messageTemplate, generatedByAi: false, tokensUsed: 0, modelUsed: 'fallback_template' }
        }

        const safety = checkRetentionMessageSafety(genResult.data.message)
        if (!safety.safe) {
          logger.warn('AI message rejected by content filter, falling back to template', {
            salonId: step.salonId,
            customerId: customer.customerId,
            pattern: safety.matchedPattern,
          })
          return { customer, message: step.messageTemplate, generatedByAi: false, tokensUsed: 0, modelUsed: 'fallback_filter' }
        }

        return {
          customer,
          message: genResult.data.message,
          generatedByAi: true,
          tokensUsed: genResult.data.tokensUsed,
          modelUsed: genResult.data.modelUsed,
        }
      }
    )

    for (const settled of generations) {
      if (settled.status !== 'fulfilled') {
        logger.error('AI retention generation rejected', { err: String(settled.reason) })
        continue
      }
      const { customer, message, generatedByAi, tokensUsed, modelUsed } = settled.value
      if (!generatedByAi) result.fallbackCount += 1

      const plan = makeSchedulingPlan()

      try {
        await db.insert(campaignMessages).values({
          campaignId,
          customerId: customer.customerId,
          recoveryStepId: step.stepId,
          phoneNumber: customer.phone,
          messageSent: message,
          messageHash: hashMessage(message),
          generatedByAi,
          tokensUsed: tokensUsed || null,
          modelUsed,
          status: 'pending',
          sentAt: plan.scheduledAt,
        })
        result.enqueuedCount += 1
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        if (errMsg.includes('campaign_msgs_dedup') || errMsg.includes('duplicate key')) {
          result.skippedDuplicate += 1
        } else {
          logger.error('Failed to insert campaign_message for AI retention', {
            err: errMsg,
            customerId: customer.customerId,
            stepId: step.stepId,
          })
        }
      }
    }
  }

  logger.info('AI retention dispatcher run completed', { ...result })
  return result
}
