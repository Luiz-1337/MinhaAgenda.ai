import { TimeSlot } from "../../domain/entities"

/**
 * Dados para criação de agendamento externo
 */
export interface CreateBookingData {
  professionalId: string
  customerId: string
  serviceId: string
  startsAt: Date
  endsAt: Date
  notes?: string
}

/**
 * Dados para atualização de agendamento externo
 */
export interface UpdateBookingData {
  professionalId?: string
  serviceId?: string
  startsAt?: Date
  endsAt?: Date
  notes?: string
}

/**
 * Interface para sistemas de agendamento externos (ex: Trinks)
 */
export interface IExternalScheduler {
  /**
   * Verifica disponibilidade no sistema externo
   */
  checkAvailability(professionalId: string, date: Date): Promise<TimeSlot[]>

  /**
   * Busca slots ocupados no sistema externo
   */
  getBusySlots(professionalId: string, start: Date, end: Date): Promise<TimeSlot[]>

  /**
   * Cria um agendamento no sistema externo
   */
  createBooking(data: CreateBookingData): Promise<string>

  /**
   * Atualiza um agendamento no sistema externo
   */
  updateBooking(bookingId: string, data: UpdateBookingData): Promise<void>

  /**
   * Cancela um agendamento no sistema externo
   */
  cancelBooking(bookingId: string): Promise<void>

  /**
   * Verifica se o sistema está configurado para um salão
   */
  isConfigured(salonId: string): Promise<boolean>
}
