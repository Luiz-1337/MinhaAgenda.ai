/**
 * External sync service implementation
 * Uses Strategy pattern for different providers (Google, Trinks, etc)
 * 
 * @deprecated Use SyncAppointmentCreationUseCase, SyncAppointmentUpdateUseCase, SyncAppointmentDeletionUseCase instead
 */

import type { IExternalSyncService } from '@repo/db/domain/integrations/interfaces/external-sync.interface'
import type { AppointmentId } from '@repo/db/domain/integrations/value-objects/appointment-id'
import { db, appointments } from '@repo/db'
import { eq } from 'drizzle-orm'
import { logger } from '@repo/db/infrastructure/logger'

/**
 * Checks if Google Calendar integration is active for a salon
 */
async function checkGoogleCalendarIntegration(salonId: string): Promise<boolean> {
  try {
    const { getSalonGoogleClient } = await import('@repo/db')
    const client = await getSalonGoogleClient(salonId)
    return client !== null
  } catch (error) {
    logger.warn('Error checking Google Calendar integration', {
      salonId,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

/**
 * External sync service - syncs appointments with Google Calendar
 * Implements IExternalSyncService interface
 */
class GoogleCalendarSyncService implements IExternalSyncService {
  async syncCreate(appointmentId: AppointmentId): Promise<void> {
    const hasIntegration = await checkGoogleCalendarIntegration(
      (await db.query.appointments.findFirst({
        where: eq(appointments.id, appointmentId),
        columns: { salonId: true },
      }))?.salonId || ''
    )

    if (!hasIntegration) {
      return
    }

    const { createGoogleEvent } = await import('@repo/db')
    const result = await createGoogleEvent(appointmentId)

    if (result) {
      logger.info('Appointment synced with Google Calendar', {
        appointmentId,
        eventId: result.eventId,
        htmlLink: result.htmlLink,
      })
    } else {
      logger.warn('Google Calendar sync returned null - integration may not be configured', {
        appointmentId,
      })
    }
  }

  async syncUpdate(appointmentId: AppointmentId): Promise<void> {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true },
    })

    if (!appointment) {
      return
    }

    const hasIntegration = await checkGoogleCalendarIntegration(appointment.salonId)
    if (!hasIntegration) {
      return
    }

    const { updateGoogleEvent } = await import('@repo/db')
    const result = await updateGoogleEvent(appointmentId)

    if (result) {
      logger.info('Appointment updated in Google Calendar', {
        appointmentId,
        eventId: result.eventId,
        htmlLink: result.htmlLink,
      })
    } else {
      logger.warn('Google Calendar update returned null - integration may not be configured', {
        appointmentId,
      })
    }
  }

  async syncDelete(appointmentId: AppointmentId): Promise<void> {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true },
    })

    if (!appointment) {
      return
    }

    const hasIntegration = await checkGoogleCalendarIntegration(appointment.salonId)
    if (!hasIntegration) {
      return
    }

    const { deleteGoogleEvent } = await import('@repo/db')
    const result = await deleteGoogleEvent(appointmentId)

    if (result === true) {
      logger.info('Event removed successfully from Google Calendar', { appointmentId })
    } else if (result === false) {
      logger.debug('Appointment had no event in Google Calendar', { appointmentId })
    } else {
      logger.warn('Could not remove event from Google Calendar - integration may not be configured', {
        appointmentId,
      })
    }
  }
}

const syncService = new GoogleCalendarSyncService()

/**
 * @deprecated Use SyncAppointmentCreationUseCase instead
 */
export async function syncCreateAppointment(appointmentId: string): Promise<void> {
  try {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true },
    })

    if (!appointment) {
      logger.warn('Appointment not found for synchronization', { appointmentId })
      return
    }

    await syncService.syncCreate(appointmentId as AppointmentId)
  } catch (error) {
    logger.error('Error syncing appointment creation', {
      appointmentId,
      error: error instanceof Error ? error.message : String(error),
    }, error as Error)
  }
}

/**
 * @deprecated Use SyncAppointmentUpdateUseCase instead
 */
export async function syncUpdateAppointment(appointmentId: string): Promise<void> {
  try {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true },
    })

    if (!appointment) {
      logger.warn('Appointment not found for synchronization', { appointmentId })
      return
    }

    await syncService.syncUpdate(appointmentId as AppointmentId)
  } catch (error) {
    logger.error('Error syncing appointment update', {
      appointmentId,
      error: error instanceof Error ? error.message : String(error),
    }, error as Error)
  }
}

/**
 * @deprecated Use SyncAppointmentDeletionUseCase instead
 * IMPORTANT: This function must be called BEFORE deleting the appointment from the database
 */
export async function syncDeleteAppointment(appointmentId: string): Promise<void> {
  try {
    const appointment = await db.query.appointments.findFirst({
      where: eq(appointments.id, appointmentId),
      columns: { salonId: true },
    })

    if (!appointment) {
      logger.warn('Appointment not found for deletion synchronization', { appointmentId })
      return
    }

    await syncService.syncDelete(appointmentId as AppointmentId)
  } catch (error) {
    logger.error('Error syncing appointment deletion', {
      appointmentId,
      error: error instanceof Error ? error.message : String(error),
    }, error as Error)
  }
}
