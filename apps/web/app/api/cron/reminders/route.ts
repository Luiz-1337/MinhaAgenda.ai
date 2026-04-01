import { logger, db } from '@repo/db'
import { sendWhatsAppMessage } from '@/lib/services/evolution/evolution-message.service'
import { dispatchDailyReminders } from '@/lib/services/reminders.service'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// Wrapper para adaptar sendWhatsAppMessage ao tipo SendReminderMessage
const sendReminderMessage = async (to: string, body: string, salonId: string): Promise<void> => {
    await sendWhatsAppMessage(to, body, salonId)
}

export async function GET(request: NextRequest) {
    const authError = requireCronAuth(request.headers)
    if (authError) return authError
    try {
        const result = await dispatchDailyReminders(sendReminderMessage)

        logger.info('Reminders dispatcher executed', { result })

        return Response.json({
            queuedCount: result.queuedCount,
            failedCount: result.failedCount,
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Reminders dispatcher failed', { error: errorMessage }, error as Error)
        return new Response('Reminders dispatcher failed', { status: 500 })
    }
}
