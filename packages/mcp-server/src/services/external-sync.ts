/**
 * Helper functions for syncing appointments with external systems
 * These functions instantiate the use cases with required dependencies
 */

import type { IExternalSyncService, AppointmentId } from '@repo/db'
import { AppointmentRepository, GoogleCalendarIntegration, logger, createAppointmentId } from '@repo/db'
import { SyncAppointmentCreationUseCase } from '../application/use-cases/sync-appointment-creation.use-case'
import { SyncAppointmentUpdateUseCase } from '../application/use-cases/sync-appointment-update.use-case'
import { SyncAppointmentDeletionUseCase } from '../application/use-cases/sync-appointment-deletion.use-case'

// Create shared instances
const appointmentRepository = new AppointmentRepository()
const calendarIntegration = new GoogleCalendarIntegration(appointmentRepository, logger)

// Adapter to convert GoogleCalendarIntegration to IExternalSyncService
class GoogleCalendarSyncAdapter implements IExternalSyncService {
  constructor(private readonly calendarIntegration: GoogleCalendarIntegration) {}

  async syncCreate(appointmentId: AppointmentId): Promise<void> {
    const result = await this.calendarIntegration.createEvent(appointmentId)
    if (!result) {
      // Integration not configured - this is OK, just log and continue
      return
    }
  }

  async syncUpdate(appointmentId: AppointmentId): Promise<void> {
    const result = await this.calendarIntegration.updateEvent(appointmentId)
    if (!result) {
      // Integration not configured - this is OK, just log and continue
      return
    }
  }

  async syncDelete(appointmentId: AppointmentId): Promise<void> {
    await this.calendarIntegration.deleteEvent(appointmentId)
    // deleteEvent returns boolean | null, but we don't need to check it
    // as it's non-blocking
  }
}

const syncService = new GoogleCalendarSyncAdapter(calendarIntegration)

/**
 * Syncs appointment creation with external systems (Google Calendar, etc.)
 * Non-blocking: errors don't prevent main operation
 */
export async function syncCreateAppointment(appointmentId: string): Promise<void> {
  const useCase = new SyncAppointmentCreationUseCase(
    appointmentRepository,
    syncService,
    logger
  )
  await useCase.execute(appointmentId)
}

/**
 * Syncs appointment update with external systems
 * Non-blocking: errors don't prevent main operation
 */
export async function syncUpdateAppointment(appointmentId: string): Promise<void> {
  const useCase = new SyncAppointmentUpdateUseCase(
    appointmentRepository,
    syncService,
    logger
  )
  await useCase.execute(appointmentId)
}

/**
 * Syncs appointment deletion with external systems
 * IMPORTANT: Must be called BEFORE deleting from database
 * Non-blocking: errors don't prevent main operation
 */
export async function syncDeleteAppointment(appointmentId: string): Promise<void> {
  const useCase = new SyncAppointmentDeletionUseCase(
    appointmentRepository,
    syncService,
    logger
  )
  await useCase.execute(appointmentId)
}
