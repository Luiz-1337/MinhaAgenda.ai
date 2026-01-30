/**
 * Interface para operações com Trinks
 */
export interface TrinksAppointmentData {
  appointmentId: string
  salonId: string
  professionalId: string
  customerId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
  customerName?: string
  serviceName?: string
  notes?: string
}

export interface TrinksCreateResult {
  eventId: string
}

export interface ITrinksService {
  /**
   * Cria um agendamento no Trinks
   */
  createAppointment(data: TrinksAppointmentData): Promise<TrinksCreateResult | null>

  /**
   * Atualiza um agendamento no Trinks
   */
  updateAppointment(data: TrinksAppointmentData & { trinksEventId?: string | null }): Promise<void>

  /**
   * Deleta um agendamento do Trinks
   */
  deleteAppointment(appointmentId: string, trinksEventId: string): Promise<boolean>
}
