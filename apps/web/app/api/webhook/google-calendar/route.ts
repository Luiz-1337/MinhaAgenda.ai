import { NextRequest, NextResponse } from 'next/server'
import { performIncrementalSync } from '@repo/db/services/google-calendar-sync'
import { db, eq, googleCalendarSyncChannels } from '@repo/db'

/**
 * Google Calendar Push Notification Webhook
 *
 * Google sends POST notifications here when calendar events change.
 * Headers include:
 * - X-Goog-Channel-ID: our channelId (UUID we generated)
 * - X-Goog-Resource-ID: Google's resourceId for the channel
 * - X-Goog-Resource-State: 'sync' (initial) or 'exists' (change detected)
 *
 * MUST respond within 10 seconds (Google requirement).
 */
export async function POST(req: NextRequest) {
  const channelId = req.headers.get('x-goog-channel-id')
  const resourceId = req.headers.get('x-goog-resource-id')
  const resourceState = req.headers.get('x-goog-resource-state')

  // Always return 200 to Google to avoid retry noise
  if (!channelId || !resourceId) {
    console.warn('[GCal Webhook] Missing headers', { channelId, resourceId })
    return NextResponse.json({ ok: true })
  }

  // 'sync' is the initial registration confirmation - no action needed
  if (resourceState === 'sync') {
    console.log('[GCal Webhook] Channel sync confirmation received', { channelId })
    return NextResponse.json({ ok: true })
  }

  // Validate channel exists in our database
  const channel = await db.query.googleCalendarSyncChannels.findFirst({
    where: eq(googleCalendarSyncChannels.channelId, channelId),
    columns: { id: true, salonId: true },
  })

  if (!channel) {
    console.warn('[GCal Webhook] Unknown channel', { channelId })
    return NextResponse.json({ ok: true })
  }

  // Process the sync inline (typically fast: just a few events)
  try {
    const result = await performIncrementalSync(channelId)
    console.log('[GCal Webhook] Sync complete', {
      channelId,
      salonId: channel.salonId,
      ...result,
    })
  } catch (error) {
    console.error('[GCal Webhook] Sync failed', { channelId, error })
    // Still return 200 - we don't want Google to keep retrying
  }

  return NextResponse.json({ ok: true })
}
