import type { IExternalSyncService, IAppointmentRepository, AppointmentId, ILogger } from '@repo/db'
import { createAppointmentId } from '@repo/db'

/**
 * Use case for syncing appointment update with external systems
 * Non-blocking: errors in synchronization don't prevent main operation
 */
export class SyncAppointmentUpdateUseCase {
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
        this.logger.warn('Appointment not found for synchronization', { appointmentId })
        return
      }

      await this.syncService.syncUpdate(id)
      this.logger.info('Appointment update synced successfully', { appointmentId })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('Error syncing appointment update', { appointmentId, error: errorMessage }, error as Error)
    }
  }
}
