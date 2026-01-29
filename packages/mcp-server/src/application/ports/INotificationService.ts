/**
 * Dados de agendamento para notificação
 */
export interface AppointmentNotificationData {
  appointmentId: string
  customerName: string
  customerPhone: string
  professionalName: string
  serviceName: string
  startsAt: Date
  salonName: string
}

/**
 * Interface para serviço de notificações
 * Abstração para WhatsApp, SMS, Email, etc.
 */
export interface INotificationService {
  /**
   * Envia confirmação de agendamento
   */
  sendConfirmation(data: AppointmentNotificationData): Promise<void>

  /**
   * Envia lembrete de agendamento
   */
  sendReminder(data: AppointmentNotificationData): Promise<void>

  /**
   * Notifica cancelamento
   */
  sendCancellation(data: AppointmentNotificationData): Promise<void>

  /**
   * Notifica reagendamento
   */
  sendReschedule(
    data: AppointmentNotificationData,
    previousDate: Date
  ): Promise<void>
}
