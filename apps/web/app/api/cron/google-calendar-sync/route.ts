import { logger } from '@repo/db'
import { pollAllChannels, renewExpiringChannels } from '@repo/db/services/google-calendar-sync'
import { requireCronAuth } from '@/lib/services/admin-auth.service'
import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

/**
 * Google Calendar Sync Cron
 *
 * Runs every 15 minutes as a fallback for missed push notifications.
 * Also renews watch channels that are about to expire.
 */
export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request.headers)
  if (authError) return authError

  try {
    // Renew expiring channels
    const renewalResult = await renewExpiringChannels()

    // Poll all active channels for missed changes
    const syncResult = await pollAllChannels()

    logger.info('Google Calendar sync cron executed', {
      renewal: renewalResult,
      sync: syncResult,
    })

    return Response.json({
      renewal: renewalResult,
      sync: syncResult,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Google Calendar sync cron failed', { error: errorMessage }, error as Error)
    return new Response('Google Calendar sync cron failed', { status: 500 })
  }
}
