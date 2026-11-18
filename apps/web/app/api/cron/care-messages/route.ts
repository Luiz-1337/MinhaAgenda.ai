import { logger } from '@repo/db'
import { runCareMessageDispatcher } from '@/lib/services/care-messages/dispatcher.service'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * A fila de mensagens ao cliente: cuidados de antes e de depois, retorno e pedido
 * de avaliação (docs/ROADMAP.md, fase 6, fatia 6d). Roda a cada meia hora; fora
 * das 9h–20h de Brasília não envia nada.
 */
export async function GET(request: NextRequest) {
    const authError = requireCronAuth(request.headers)
    if (authError) return authError
    try {
        const result = await runCareMessageDispatcher()

        logger.info('Care messages dispatcher executed', { result })

        return Response.json(result)
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('Care messages dispatcher failed', { error: errorMessage }, error as Error)
        return new Response('Care messages dispatcher failed', { status: 500 })
    }
}
