/**
 * Helper functions for syncing appointments with external systems
 * Uses the simplified GoogleCalendarService directly
 */

import { 
  createGoogleEvent, 
  updateGoogleEvent, 
  deleteGoogleEvent,
  logger 
} from '@repo/db'

/**
 * Syncs appointment creation with external systems (Google Calendar)
 * Non-blocking: errors are logged but don't prevent main operation
 */
export async function syncCreateAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment creation', { appointmentId })
    const result = await createGoogleEvent(appointmentId)
    
    if (result) {
      logger.info('Appointment synced to Google Calendar', { 
        appointmentId, 
        eventId: result.eventId 
      })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    logger.error(
      'Failed to sync appointment creation to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Syncs appointment update with external systems
 * Non-blocking: errors are logged but don't prevent main operation
 */
export async function syncUpdateAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment update', { appointmentId })
    const result = await updateGoogleEvent(appointmentId)
    
    if (result) {
      logger.info('Appointment update synced to Google Calendar', { 
        appointmentId, 
        eventId: result.eventId 
      })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    logger.error(
      'Failed to sync appointment update to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Syncs appointment deletion with external systems
 * IMPORTANT: Must be called BEFORE deleting from database
 * Non-blocking: errors are logged but don't prevent main operation
 */
export async function syncDeleteAppointment(appointmentId: string): Promise<void> {
  try {
    logger.debug('Syncing appointment deletion', { appointmentId })
    const result = await deleteGoogleEvent(appointmentId)
    
    if (result === true) {
      logger.info('Appointment deletion synced to Google Calendar', { appointmentId })
    } else if (result === false) {
      logger.debug('No Google Calendar event to delete', { appointmentId })
    } else {
      logger.debug('Google Calendar integration not configured', { appointmentId })
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    logger.error(
      'Failed to sync appointment deletion to Google Calendar',
      { appointmentId },
      error instanceof Error ? error : undefined
    )
  }
}
