/**
 * Google Calendar Bidirectional Sync Service
 *
 * Handles Google -> App synchronization:
 * - Watch channel management (setup, teardown, renewal)
 * - Incremental sync via syncToken
 * - Event reconciliation (create blocked time, update, cancel)
 * - Loop prevention via syncSource + timestamp check
 */

import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'
import { eq, and, lt } from 'drizzle-orm'
import { randomUUID } from 'crypto'

import { db } from '../index'
import {
  appointments,
  googleCalendarSyncChannels,
  salonIntegrations,
  professionals,
  salons,
  profiles,
} from '../schema'
import { logger as defaultLogger } from '../infrastructure/logger'
import { GoogleCalendarService, GoogleCalendarError } from './google-calendar'
import { createBlockedTimeService } from './appointments'
import {
  GOOGLE_CHANNEL_EXPIRY_DAYS,
  GOOGLE_CHANNEL_RENEWAL_THRESHOLD_MS,
  GOOGLE_SYNC_LOOP_WINDOW_MS,
  GOOGLE_TIMEZONE_DEFAULT,
} from '../domain/constants'

const logger = defaultLogger

// ============================================================================
// Watch Channel Management
// ============================================================================

/**
 * Sets up a Google Calendar watch channel for a specific calendar.
 * Google will POST notifications to our webhook when events change.
 */
export async function setupWatchChannel(
  salonId: string,
  calendarId: string,
  professionalId?: string | null
): Promise<{ channelId: string; resourceId: string } | null> {
  const service = GoogleCalendarService.getInstance()
  const authClient = await service.getAuthClient(salonId)

  if (!authClient) {
    logger.warn('Cannot setup watch channel: no auth client', { salonId })
    return null
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/google-calendar`
  const channelId = randomUUID()
  const expirationMs = Date.now() + GOOGLE_CHANNEL_EXPIRY_DAYS * 24 * 60 * 60 * 1000

  const calendar = google.calendar({ version: 'v3', auth: authClient.client })

  try {
    const response = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        expiration: String(expirationMs),
      },
    })

    const resourceId = response.data.resourceId
    if (!resourceId) {
      throw new Error('Watch channel created but resourceId not returned')
    }

    // Store channel in DB
    await db.insert(googleCalendarSyncChannels).values({
      salonId,
      calendarId,
      channelId,
      resourceId,
      expiration: new Date(expirationMs),
      professionalId: professionalId || null,
    })

    logger.info('Watch channel created', { salonId, calendarId, channelId })

    // Perform initial full sync to get the first syncToken
    await performFullSync(salonId, calendarId, channelId)

    return { channelId, resourceId }
  } catch (error) {
    logger.error('Failed to setup watch channel', { salonId, calendarId, error })
    return null
  }
}

/**
 * Tears down all watch channels for a salon.
 * Called when Google Calendar integration is disabled.
 */
export async function teardownWatchChannels(salonId: string): Promise<void> {
  const channels = await db.query.googleCalendarSyncChannels.findMany({
    where: eq(googleCalendarSyncChannels.salonId, salonId),
  })

  if (channels.length === 0) return

  const service = GoogleCalendarService.getInstance()
  const authClient = await service.getAuthClient(salonId)

  for (const channel of channels) {
    if (authClient) {
      try {
        const calendar = google.calendar({ version: 'v3', auth: authClient.client })
        await calendar.channels.stop({
          requestBody: {
            id: channel.channelId,
            resourceId: channel.resourceId,
          },
        })
        logger.info('Watch channel stopped', { channelId: channel.channelId })
      } catch (error) {
        // Channel may already be expired, that's OK
        logger.warn('Failed to stop watch channel (may be expired)', {
          channelId: channel.channelId,
          error,
        })
      }
    }

    await db.delete(googleCalendarSyncChannels).where(eq(googleCalendarSyncChannels.id, channel.id))
  }

  logger.info('All watch channels torn down', { salonId, count: channels.length })
}

/**
 * Renews watch channels that are about to expire.
 * Should be called by a daily cron job.
 */
export async function renewExpiringChannels(): Promise<{ renewed: number; failed: number }> {
  const threshold = new Date(Date.now() + GOOGLE_CHANNEL_RENEWAL_THRESHOLD_MS)

  const expiringChannels = await db.query.googleCalendarSyncChannels.findMany({
    where: lt(googleCalendarSyncChannels.expiration, threshold),
  })

  let renewed = 0
  let failed = 0

  for (const channel of expiringChannels) {
    try {
      // Stop old channel
      const service = GoogleCalendarService.getInstance()
      const authClient = await service.getAuthClient(channel.salonId)

      if (authClient) {
        try {
          const calendar = google.calendar({ version: 'v3', auth: authClient.client })
          await calendar.channels.stop({
            requestBody: {
              id: channel.channelId,
              resourceId: channel.resourceId,
            },
          })
        } catch {
          // Old channel may already be expired
        }
      }

      // Delete old channel record
      await db.delete(googleCalendarSyncChannels).where(eq(googleCalendarSyncChannels.id, channel.id))

      // Create new channel
      const result = await setupWatchChannel(
        channel.salonId,
        channel.calendarId,
        channel.professionalId
      )

      if (result) {
        renewed++
      } else {
        failed++
      }
    } catch (error) {
      logger.error('Failed to renew channel', { channelId: channel.channelId, error })
      failed++
    }
  }

  logger.info('Channel renewal complete', { renewed, failed })
  return { renewed, failed }
}

// ============================================================================
// Setup Channels for Salon
// ============================================================================

/**
 * Sets up watch channels for all relevant calendars of a salon.
 * For SOLO: watches the owner's primary calendar.
 * For PRO: watches each professional's calendar.
 */
export async function setupWatchChannelsForSalon(salonId: string): Promise<number> {
  const service = GoogleCalendarService.getInstance()
  const authClient = await service.getAuthClient(salonId)
  if (!authClient) return 0

  // Determine plan type
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })
  if (!salon) return 0

  const ownerProfile = await db.query.profiles.findFirst({
    where: eq(profiles.id, salon.ownerId),
    columns: { tier: true },
  })

  const isSolo = ownerProfile?.tier === 'SOLO'
  let channelsCreated = 0

  // Remove existing channels first
  await teardownWatchChannels(salonId)

  if (isSolo) {
    // SOLO: watch the owner's primary calendar
    const calendarId = authClient.email
    if (calendarId) {
      const result = await setupWatchChannel(salonId, calendarId, null)
      if (result) channelsCreated++
    }
  } else {
    // PRO/ENTERPRISE: watch each professional's calendar
    const salonProfessionals = await db.query.professionals.findMany({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.isActive, true)
      ),
      columns: { id: true, googleCalendarId: true, email: true },
    })

    for (const pro of salonProfessionals) {
      const calendarId = pro.googleCalendarId || pro.email
      if (calendarId) {
        const result = await setupWatchChannel(salonId, calendarId, pro.id)
        if (result) channelsCreated++
      }
    }
  }

  logger.info('Watch channels setup for salon', { salonId, channelsCreated, isSolo })
  return channelsCreated
}

// ============================================================================
// Incremental Sync
// ============================================================================

/**
 * Performs a full sync to establish the initial syncToken.
 * This fetches all events but only stores the token, not the events.
 * (Events already in the app are linked via googleEventId)
 */
async function performFullSync(
  salonId: string,
  calendarId: string,
  channelId: string
): Promise<void> {
  const service = GoogleCalendarService.getInstance()
  const authClient = await service.getAuthClient(salonId)
  if (!authClient) return

  const calendar = google.calendar({ version: 'v3', auth: authClient.client })

  try {
    let pageToken: string | undefined
    let nextSyncToken: string | undefined

    // Paginate through all events to get the final syncToken
    do {
      const response = await calendar.events.list({
        calendarId,
        pageToken,
        maxResults: 250,
        singleEvents: true,
      })

      pageToken = response.data.nextPageToken || undefined
      nextSyncToken = response.data.nextSyncToken || undefined
    } while (pageToken)

    if (nextSyncToken) {
      await db
        .update(googleCalendarSyncChannels)
        .set({ syncToken: nextSyncToken, updatedAt: new Date() })
        .where(eq(googleCalendarSyncChannels.channelId, channelId))

      logger.info('Full sync complete, syncToken stored', { salonId, calendarId })
    }

    // Mark initial sync as done
    await db
      .update(salonIntegrations)
      .set({ initialSyncDone: true, updatedAt: new Date() })
      .where(and(
        eq(salonIntegrations.salonId, salonId),
        eq(salonIntegrations.provider, 'google')
      ))
  } catch (error) {
    logger.error('Full sync failed', { salonId, calendarId, error })
  }
}

/**
 * Performs an incremental sync using the stored syncToken.
 * Called when Google sends a push notification about changes.
 */
export async function performIncrementalSync(channelId: string): Promise<{
  processed: number
  skipped: number
  errors: number
}> {
  const channel = await db.query.googleCalendarSyncChannels.findFirst({
    where: eq(googleCalendarSyncChannels.channelId, channelId),
  })

  if (!channel) {
    logger.warn('Channel not found for incremental sync', { channelId })
    return { processed: 0, skipped: 0, errors: 0 }
  }

  const service = GoogleCalendarService.getInstance()
  const authClient = await service.getAuthClient(channel.salonId)
  if (!authClient) {
    logger.warn('No auth client for incremental sync', { salonId: channel.salonId })
    return { processed: 0, skipped: 0, errors: 0 }
  }

  const calendar = google.calendar({ version: 'v3', auth: authClient.client })
  let processed = 0
  let skipped = 0
  let errors = 0

  try {
    let pageToken: string | undefined
    let nextSyncToken: string | undefined

    const listParams: calendar_v3.Params$Resource$Events$List = {
      calendarId: channel.calendarId,
      singleEvents: true,
      maxResults: 250,
    }

    // Use syncToken if available, otherwise do a full re-sync
    if (channel.syncToken) {
      listParams.syncToken = channel.syncToken
    } else {
      // No syncToken: fetch recent events only (last 30 days)
      listParams.timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }

    do {
      let responseData: calendar_v3.Schema$Events

      try {
        const response = await calendar.events.list({
          ...listParams,
          pageToken,
        })
        responseData = response.data
      } catch (error: unknown) {
        // 410 GONE: syncToken expired, need full re-sync
        const errObj = error as { code?: number }
        if (errObj?.code === 410) {
          logger.info('SyncToken expired, performing full re-sync', { channelId })
          await performFullSync(channel.salonId, channel.calendarId, channelId)
          return { processed: 0, skipped: 0, errors: 0 }
        }
        throw error
      }

      const events = responseData.items || []

      for (const event of events) {
        try {
          const result = await reconcileGoogleEvent(
            event,
            channel.salonId,
            channel.professionalId
          )
          if (result === 'processed') processed++
          else skipped++
        } catch (error) {
          logger.error('Failed to reconcile event', { eventId: event.id, error })
          errors++
        }
      }

      pageToken = responseData.nextPageToken || undefined
      nextSyncToken = responseData.nextSyncToken || undefined
    } while (pageToken)

    // Update syncToken
    if (nextSyncToken) {
      await db
        .update(googleCalendarSyncChannels)
        .set({ syncToken: nextSyncToken, updatedAt: new Date() })
        .where(eq(googleCalendarSyncChannels.id, channel.id))
    }
  } catch (error) {
    logger.error('Incremental sync failed', { channelId, error })
    errors++
  }

  logger.info('Incremental sync complete', { channelId, processed, skipped, errors })
  return { processed, skipped, errors }
}

// ============================================================================
// Event Reconciliation
// ============================================================================

/**
 * Reconciles a single Google Calendar event with the local database.
 * Returns 'processed' if a change was made, 'skipped' if no action needed.
 */
async function reconcileGoogleEvent(
  event: calendar_v3.Schema$Event,
  salonId: string,
  professionalId: string | null
): Promise<'processed' | 'skipped'> {
  if (!event.id) return 'skipped'

  // Find existing appointment by googleEventId
  const existingAppointment = await db.query.appointments.findFirst({
    where: eq(appointments.googleEventId, event.id),
    columns: {
      id: true,
      salonId: true,
      date: true,
      endTime: true,
      status: true,
      syncSource: true,
      updatedAt: true,
      notes: true,
    },
  })

  // Loop prevention: if the appointment was recently modified by the app,
  // this notification is just the echo of our own change
  if (existingAppointment) {
    const timeSinceUpdate = Date.now() - existingAppointment.updatedAt.getTime()
    if (existingAppointment.syncSource === 'app' && timeSinceUpdate < GOOGLE_SYNC_LOOP_WINDOW_MS) {
      logger.debug('Skipping echo event (loop prevention)', {
        eventId: event.id,
        appointmentId: existingAppointment.id,
        timeSinceUpdate,
      })
      return 'skipped'
    }
  }

  // Event was deleted in Google Calendar
  if (event.status === 'cancelled') {
    if (existingAppointment && existingAppointment.status !== 'cancelled') {
      await db
        .update(appointments)
        .set({
          status: 'cancelled',
          syncSource: 'google',
          updatedAt: new Date(),
        })
        .where(eq(appointments.id, existingAppointment.id))

      logger.info('Appointment cancelled from Google Calendar', {
        appointmentId: existingAppointment.id,
        googleEventId: event.id,
      })
      return 'processed'
    }
    return 'skipped'
  }

  // Parse event times
  const startTime = parseEventDateTime(event.start)
  const endTime = parseEventDateTime(event.end)
  if (!startTime || !endTime) return 'skipped'

  // Resolve professional - for SOLO plans, get the owner's professional record
  const resolvedProfessionalId = professionalId || await getOwnerProfessionalId(salonId)
  if (!resolvedProfessionalId) {
    logger.warn('Cannot resolve professional for event', { salonId, eventId: event.id })
    return 'skipped'
  }

  if (existingAppointment) {
    // Event was updated in Google Calendar
    // Last-write-wins: compare Google event updated time with our updatedAt
    const googleUpdated = event.updated ? new Date(event.updated) : new Date()
    const appUpdated = existingAppointment.updatedAt

    if (googleUpdated.getTime() <= appUpdated.getTime()) {
      // App change is newer, skip
      return 'skipped'
    }

    // Apply the Google Calendar changes
    await db
      .update(appointments)
      .set({
        date: startTime,
        endTime: endTime,
        syncSource: 'google',
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, existingAppointment.id))

    logger.info('Appointment updated from Google Calendar', {
      appointmentId: existingAppointment.id,
      googleEventId: event.id,
    })
    return 'processed'
  }

  // New event - create blocked time
  const result = await createBlockedTimeService({
    salonId,
    professionalId: resolvedProfessionalId,
    startTime,
    endTime,
    googleEventId: event.id,
    summary: event.summary,
  })

  if (result.success) {
    logger.info('Blocked time created from Google Calendar', {
      appointmentId: result.data.appointmentId,
      googleEventId: event.id,
      summary: event.summary,
    })
    return 'processed'
  }

  logger.warn('Failed to create blocked time', { eventId: event.id, error: result.error })
  return 'skipped'
}

// ============================================================================
// Polling Sync (Fallback)
// ============================================================================

/**
 * Runs incremental sync for all active channels.
 * Used as a cron fallback for missed push notifications.
 */
export async function pollAllChannels(): Promise<{
  total: number
  processed: number
  errors: number
}> {
  const channels = await db.query.googleCalendarSyncChannels.findMany()

  let total = 0
  let processed = 0
  let syncErrors = 0

  for (const channel of channels) {
    // Verify the salon's integration is still active
    const integration = await db.query.salonIntegrations.findFirst({
      where: and(
        eq(salonIntegrations.salonId, channel.salonId),
        eq(salonIntegrations.provider, 'google'),
        eq(salonIntegrations.isActive, true)
      ),
    })

    if (!integration) continue

    total++
    try {
      const result = await performIncrementalSync(channel.channelId)
      processed += result.processed
      syncErrors += result.errors
    } catch (error) {
      logger.error('Poll sync failed for channel', { channelId: channel.channelId, error })
      syncErrors++
    }
  }

  return { total, processed, errors: syncErrors }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse Google Calendar event datetime (handles both dateTime and date fields)
 */
function parseEventDateTime(
  eventDateTime: calendar_v3.Schema$EventDateTime | undefined
): Date | null {
  if (!eventDateTime) return null

  if (eventDateTime.dateTime) {
    return new Date(eventDateTime.dateTime)
  }

  // All-day event
  if (eventDateTime.date) {
    return new Date(eventDateTime.date)
  }

  return null
}

/**
 * Gets the owner's professional record ID for a salon (used in SOLO plan).
 */
async function getOwnerProfessionalId(salonId: string): Promise<string | null> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })
  if (!salon) return null

  const ownerPro = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.salonId, salonId),
      eq(professionals.userId, salon.ownerId),
      eq(professionals.isActive, true)
    ),
    columns: { id: true },
  })

  // Fallback: get any OWNER role professional
  if (!ownerPro) {
    const ownerByRole = await db.query.professionals.findFirst({
      where: and(
        eq(professionals.salonId, salonId),
        eq(professionals.role, 'OWNER'),
        eq(professionals.isActive, true)
      ),
      columns: { id: true },
    })
    return ownerByRole?.id ?? null
  }

  return ownerPro.id
}
