import { db, domainServices, logger, recoveryFlows, recoverySteps, sql } from '@repo/db'
import { sendWhatsAppMessage, sendWithTypingIndicator } from '@/lib/services/evolution/evolution-message.service'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { NextRequest } from 'next/server'
import { runAiRetentionDispatcher } from '@/lib/services/marketing/ai-retention-dispatcher.service'

export const runtime = 'nodejs'
export const maxDuration = 300 // Vercel Pro max — needed for parallel LLM batches and template fan-out

// Wrapper para adaptar sendWhatsAppMessage ao tipo SendMarketingMessage (Promise<void>).
// AI-generated messages get a humanizing typing indicator (presence: composing + blocking
// delay) before the text. Static templates keep the original simple-send behavior.
const sendMarketingMessage = async (
  to: string,
  body: string,
  salonId: string,
  options?: { generatedByAi?: boolean }
): Promise<void> => {
  if (options?.generatedByAi) {
    await sendWithTypingIndicator(to, body, salonId)
    return
  }
  await sendWhatsAppMessage(to, body, salonId)
}

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError
  try {
    const limboRows = await db.execute(sql`
      select
        rf.salon_id as salon_id,
        min(rs.days_after_inactivity) as timeout_days
      from ${recoveryFlows} rf
      inner join ${recoverySteps} rs
        on rs.recovery_flow_id = rf.id
      where rf.is_active = true
        and rs.is_active = true
      group by rf.salon_id
    `)

    let limboCount = 0
    for (const row of limboRows) {
      const salonId = String(row.salon_id)
      const timeoutDays = Number(row.timeout_days)
      const limboChats = await domainServices.detectLimboChats(timeoutDays, salonId)
      limboCount += limboChats.length
    }

    // 1) AI retention branch (only for allowlisted salons with use_ai_generation steps).
    //    Failures are logged but do not abort the template dispatcher.
    let aiResult: Awaited<ReturnType<typeof runAiRetentionDispatcher>> = {
      scannedSteps: 0,
      enqueuedCount: 0,
      fallbackCount: 0,
      skippedAllowlist: 0,
      skippedCap: 0,
      skippedDuplicate: 0,
    }
    try {
      aiResult = await runAiRetentionDispatcher()
    } catch (err) {
      logger.error('AI retention dispatcher failed', { err }, err as Error)
    }

    // 2) Existing template-based dispatcher (chats/messages-based limbo).
    const result = await domainServices.runMarketingDispatcher(sendMarketingMessage)

    return Response.json({
      queuedCount: result.queuedCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      skippedOptedOut: result.skippedOptedOut,
      limboCount,
      ai: aiResult,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Marketing dispatcher failed', { error: errorMessage }, error as Error)
    return new Response('Marketing dispatcher failed', { status: 500 })
  }
}
