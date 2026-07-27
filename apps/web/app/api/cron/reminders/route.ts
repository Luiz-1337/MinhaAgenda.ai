import { logger, db } from '@repo/db'
import { sendProactiveMessage } from '@/lib/services/messaging/proactive'
import { dispatchDailyReminders } from '@/lib/services/reminders.service'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

// Roteia pelo provider do salão (Evolution = texto livre; Cloud = template fora
// da janela de 24h). Lembrete é tipicamente fora da janela: quando o template
// de lembrete estiver aprovado na Meta, passar `template` aqui (gate do cutover).
// `chatId` habilita a checagem da janela de 24h no caminho Cloud: com conversa
// recente o texto livre passa; sem ele, todo lembrete exigiria template.
const sendReminderMessage = async (
    to: string,
    body: string,
    salonId: string,
    chatId?: string
): Promise<void> => {
    await sendProactiveMessage({ salonId, to, text: body, chatId })
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
