import type { AppointmentId } from '../value-objects/appointment-id'

/**
 * External sync service interface (DIP - Dependency Inversion Principle)
 */
export interface IExternalSyncService {
  /**
   * Syncs appointment creation with external systems
   */
  syncCreate(appointmentId: AppointmentId): Promise<void>

  /**
   * Syncs appointment update with external systems
   */
  syncUpdate(appointmentId: AppointmentId): Promise<void>

  /**
   * Syncs appointment deletion with external systems
   * IMPORTANT: Must be called BEFORE deleting from database
   */
  syncDelete(appointmentId: AppointmentId): Promise<void>
}
