/**
 * Integration Sync Service
 *
 * Handles synchronization of appointments with external calendars
 * (Google Calendar and Trinks) using fire-and-forget pattern.
 *
 * Key Features:
 * - Non-blocking: Sync runs in background, doesn't block user response
 * - Plan-aware: SOLO uses salon owner's calendar, PRO uses professional's calendar
 * - Status tracking: Updates syncStatus column (pending/synced/failed)
 */

import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import { appointments, salonIntegrations } from '../schema'
import { logger } from '../infrastructure/logger'
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent, GoogleCalendarError } from './google-calendar'
import { createTrinksAppointment, updateTrinksAppointment, deleteTrinksAppointment, isTrinksIntegrationActive } from './trinks'

// ============================================================================
// Types
// ============================================================================

export interface SyncResult {
    google: { success: boolean; eventId?: string; error?: string }
    trinks: { success: boolean; eventId?: string; error?: string }
    overallSuccess: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Google Calendar integration is active for a salon
 */
async function isGoogleIntegrationActive(salonId: string): Promise<boolean> {
    const integration = await db.query.salonIntegrations.findFirst({
        where: and(
            eq(salonIntegrations.salonId, salonId),
            eq(salonIntegrations.provider, 'google'),
            eq(salonIntegrations.isActive, true)
        ),
    })
    return !!integration?.refreshToken
}

/**
 * Update sync status in the appointments table
 */
async function updateSyncStatus(
    appointmentId: string,
    status: 'pending' | 'synced' | 'failed'
): Promise<void> {
    await db
        .update(appointments)
        .set({ syncStatus: status, updatedAt: new Date() })
        .where(eq(appointments.id, appointmentId))
}

// ============================================================================
// Fire-and-Forget Sync Functions
// ============================================================================

/**
 * Sync appointment creation to external calendars (fire-and-forget)
 *
 * This function is designed to be called WITHOUT await, so it doesn't
 * block the main response to the user.
 *
 * @param appointmentId - The appointment ID
 * @param salonId - The salon ID
 */
export function fireAndForgetCreate(appointmentId: string, salonId: string): void {
    // Execute sync without awaiting - true fire-and-forget
    syncAppointmentCreate(appointmentId, salonId).catch((error) => {
        logger.error('Fire-and-forget create sync failed', { appointmentId, salonId, error })
    })
}

/**
 * Sync appointment update to external calendars (fire-and-forget)
 */
export function fireAndForgetUpdate(appointmentId: string, salonId: string): void {
    syncAppointmentUpdate(appointmentId, salonId).catch((error) => {
        logger.error('Fire-and-forget update sync failed', { appointmentId, salonId, error })
    })
}

/**
 * Sync appointment deletion to external calendars (fire-and-forget)
 * Note: For delete, we may want to wait for sync before deleting from DB
 */
export function fireAndForgetDelete(appointmentId: string, salonId: string): void {
    syncAppointmentDelete(appointmentId, salonId).catch((error) => {
        logger.error('Fire-and-forget delete sync failed', { appointmentId, salonId, error })
    })
}

// ============================================================================
// Core Sync Functions
// ============================================================================

/**
 * Sync appointment creation to external calendars
 */
export async function syncAppointmentCreate(
    appointmentId: string,
    salonId: string
): Promise<SyncResult> {
    const result: SyncResult = {
        google: { success: true },
        trinks: { success: true },
        overallSuccess: true,
    }

    logger.debug('Starting calendar sync for new appointment', { appointmentId, salonId })

    // Google Calendar sync
    try {
        const isGoogleActive = await isGoogleIntegrationActive(salonId)
        console.log('[SYNC] Google integration check:', { salonId, isActive: isGoogleActive })

        if (isGoogleActive) {
            logger.debug('Google integration active, creating event', { appointmentId })
            console.log('[SYNC] Creating Google event for appointment:', appointmentId)
            const googleResult = await createGoogleEvent(appointmentId)
            console.log('[SYNC] Google event result:', googleResult)
            if (googleResult) {
                result.google.eventId = googleResult.eventId
                logger.info('Google Calendar event created', { appointmentId, eventId: googleResult.eventId })
            }
        } else {
            logger.debug('Google integration not active, skipping', { salonId })
            console.log('[SYNC] Google integration NOT active, skipping sync')
        }
    } catch (error) {
        result.google.success = false
        result.google.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        logger.error('Failed to sync appointment to Google Calendar', { appointmentId, error })
        console.error('[SYNC] Google Calendar sync error:', error)
    }

    // Trinks sync
    try {
        if (await isTrinksIntegrationActive(salonId)) {
            logger.debug('Trinks integration active, creating event', { appointmentId })
            const trinksResult = await createTrinksAppointment(appointmentId, salonId)
            if (trinksResult) {
                result.trinks.eventId = trinksResult.eventId
                logger.info('Trinks event created', { appointmentId, eventId: trinksResult.eventId })
            }
        } else {
            logger.debug('Trinks integration not active, skipping', { salonId })
        }
    } catch (error) {
        result.trinks.success = false
        result.trinks.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        logger.error('Failed to sync appointment to Trinks', { appointmentId, error })
    }

    // Update sync status based on results
    const syncStatus = result.overallSuccess ? 'synced' : 'failed'
    await updateSyncStatus(appointmentId, syncStatus)

    return result
}

/**
 * Sync appointment update to external calendars
 */
export async function syncAppointmentUpdate(
    appointmentId: string,
    salonId: string
): Promise<SyncResult> {
    const result: SyncResult = {
        google: { success: true },
        trinks: { success: true },
        overallSuccess: true,
    }

    logger.debug('Starting calendar sync for appointment update', { appointmentId, salonId })

    // Google Calendar sync
    try {
        if (await isGoogleIntegrationActive(salonId)) {
            const googleResult = await updateGoogleEvent(appointmentId)
            if (googleResult) {
                result.google.eventId = googleResult.eventId
                logger.info('Google Calendar event updated', { appointmentId, eventId: googleResult.eventId })
            }
        }
    } catch (error) {
        result.google.success = false
        result.google.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        logger.error('Failed to update appointment in Google Calendar', { appointmentId, error })
    }

    // Trinks sync
    try {
        if (await isTrinksIntegrationActive(salonId)) {
            const trinksResult = await updateTrinksAppointment(appointmentId, salonId)
            if (trinksResult) {
                result.trinks.eventId = trinksResult.eventId
                logger.info('Trinks event updated', { appointmentId, eventId: trinksResult.eventId })
            }
        }
    } catch (error) {
        result.trinks.success = false
        result.trinks.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        logger.error('Failed to update appointment in Trinks', { appointmentId, error })
    }

    // Update sync status
    const syncStatus = result.overallSuccess ? 'synced' : 'failed'
    await updateSyncStatus(appointmentId, syncStatus)

    return result
}

/**
 * Sync appointment deletion to external calendars
 * IMPORTANT: This must be called BEFORE deleting the appointment from the DB
 */
export async function syncAppointmentDelete(
    appointmentId: string,
    salonId: string
): Promise<SyncResult> {
    const result: SyncResult = {
        google: { success: true },
        trinks: { success: true },
        overallSuccess: true,
    }

    logger.debug('Starting calendar sync for appointment deletion', { appointmentId, salonId })

    // Google Calendar sync - delete event
    try {
        if (await isGoogleIntegrationActive(salonId)) {
            const deleted = await deleteGoogleEvent(appointmentId)
            if (deleted) {
                logger.info('Google Calendar event deleted', { appointmentId })
            }
        }
    } catch (error) {
        result.google.success = false
        result.google.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        // Don't fail the delete operation if calendar sync fails
        logger.error('Failed to delete appointment from Google Calendar', { appointmentId, error })
    }

    // Trinks sync - delete event
    try {
        if (await isTrinksIntegrationActive(salonId)) {
            const deleted = await deleteTrinksAppointment(appointmentId, salonId)
            if (deleted) {
                logger.info('Trinks event deleted', { appointmentId })
            }
        }
    } catch (error) {
        result.trinks.success = false
        result.trinks.error = error instanceof Error ? error.message : 'Unknown error'
        result.overallSuccess = false
        logger.error('Failed to delete appointment from Trinks', { appointmentId, error })
    }

    return result
}
