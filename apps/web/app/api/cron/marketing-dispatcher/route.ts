import { db, domainServices, logger, recoveryFlows, recoverySteps, sql } from '@repo/db'
import { sendWhatsAppMessage } from '@/lib/services/whatsapp.service'

export const runtime = 'nodejs'

// Wrapper para adaptar sendWhatsAppMessage ao tipo SendMarketingMessage (Promise<void>)
const sendMarketingMessage = async (to: string, body: string, salonId: string): Promise<void> => {
  await sendWhatsAppMessage(to, body, salonId)
}

export async function GET() {
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

    const result = await domainServices.runMarketingDispatcher(sendMarketingMessage)

    return Response.json({
      queuedCount: result.queuedCount,
      sentCount: result.sentCount,
      failedCount: result.failedCount,
      limboCount,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Marketing dispatcher failed', { error: errorMessage }, error as Error)
    return new Response('Marketing dispatcher failed', { status: 500 })
  }
}
