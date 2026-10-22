import { NextRequest } from 'next/server'
import { domainServices, logger } from '@repo/db'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { enqueueAgendaSync } from '@/lib/queues/agenda-sync-queue'

export const runtime = 'nodejs'

/**
 * Sincronização automática da agenda oficial (Belasis → MinhaAgenda), de hora em
 * hora (vercel.json). Só enfileira: o trabalho roda no worker, no ritmo lento do
 * provedor. Salão com a integração pausada fica de fora; salão com uma
 * sincronização já na fila ou rodando não ganha outra.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  try {
    const salonIds = await domainServices.listSalonsWithActiveAgenda()
    let enqueued = 0
    const failures: Array<{ salonId: string; error: string }> = []

    for (const salonId of salonIds) {
      try {
        const result = await enqueueAgendaSync({ salonId, trigger: 'cron' })
        if (result.enqueued) enqueued++
      } catch (error) {
        failures.push({ salonId, error: error instanceof Error ? error.message : String(error) })
      }
    }

    logger.info('Agenda sync cron executed', { salons: salonIds.length, enqueued, failures: failures.length })
    return Response.json({ ok: true, salons: salonIds.length, enqueued, failures })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('Agenda sync cron failed', { error: errMsg }, error as Error)
    return new Response('Agenda sync cron failed', { status: 500 })
  }
}
