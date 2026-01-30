/**
 * Adapter para o serviço Trinks usando os use cases existentes do @repo/db
 */

import { ITrinksService, TrinksAppointmentData, TrinksCreateResult } from '../../../application/ports'

export class TrinksServiceAdapter implements ITrinksService {
  constructor(private readonly salonId: string) {}

  /**
   * Cria um agendamento no Trinks
   */
  async createAppointment(data: TrinksAppointmentData): Promise<TrinksCreateResult | null> {
    const { createTrinksAppointment } = await import('@repo/db')
    const result = await createTrinksAppointment(data.appointmentId, this.salonId)
    return result ? { eventId: result.eventId } : null
  }

  /**
   * Atualiza um agendamento no Trinks
   */
  async updateAppointment(data: TrinksAppointmentData & { trinksEventId?: string | null }): Promise<void> {
    const { updateTrinksAppointment } = await import('@repo/db')
    await updateTrinksAppointment(data.appointmentId, this.salonId)
  }

  /**
   * Deleta um agendamento do Trinks
   */
  async deleteAppointment(appointmentId: string, _trinksEventId: string): Promise<boolean> {
    const { deleteTrinksAppointment } = await import('@repo/db')
    const result = await deleteTrinksAppointment(appointmentId, this.salonId)
    return result ?? false
  }
}
