import type { IExternalSyncService } from '@repo/db/domain/integrations/interfaces/external-sync.interface'
import type { IAppointmentRepository } from '@repo/db/domain/integrations/interfaces/appointment-repository.interface'
import type { ILogger } from '@repo/db/infrastructure/logger'
import type { AppointmentId } from '@repo/db/domain/integrations/value-objects/appointment-id'
import { createAppointmentId } from '@repo/db/domain/integrations/value-objects/index'

/**
 * Use case for syncing appointment deletion with external systems
 * IMPORTANT: Must be called BEFORE deleting appointment from database
 * Non-blocking: errors in synchronization don't prevent main operation
 */
export class SyncAppointmentDeletionUseCase {
  constructor(
    private readonly appointmentRepository: IAppointmentRepository,
    private readonly syncService: IExternalSyncService,
    private readonly logger: ILogger
  ) {}

  async execute(appointmentId: string): Promise<void> {
    try {
      const id = createAppointmentId(appointmentId)

      const appointment = await this.appointmentRepository.findById(id)
      if (!appointment) {
        this.logger.warn('Appointment not found for deletion synchronization', { appointmentId })
        return
      }

      await this.syncService.syncDelete(id)
      this.logger.info('Appointment deletion synced successfully', { appointmentId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Error syncing appointment deletion', { appointmentId, error: errorMessage }, error as Error)
    }
  }
}
