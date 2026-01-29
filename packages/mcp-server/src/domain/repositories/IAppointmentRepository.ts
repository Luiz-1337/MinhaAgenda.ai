import { Appointment } from "../entities"

/**
 * Interface para persistência de agendamentos
 */
export interface IAppointmentRepository {
  /**
   * Busca um agendamento por ID
   */
  findById(id: string): Promise<Appointment | null>

  /**
   * Busca agendamentos de um cliente em um salão
   */
  findByCustomer(customerId: string, salonId: string): Promise<Appointment[]>

  /**
   * Busca agendamentos de um profissional em uma data
   */
  findByProfessionalAndDate(professionalId: string, date: Date): Promise<Appointment[]>

  /**
   * Busca agendamentos futuros de um cliente
   */
  findUpcoming(customerId: string, salonId: string): Promise<Appointment[]>

  /**
   * Busca agendamentos futuros de um cliente por telefone
   */
  findUpcomingByPhone(phone: string, salonId: string): Promise<Appointment[]>

  /**
   * Busca agendamentos em conflito com um horário
   */
  findConflicting(
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string
  ): Promise<Appointment[]>

  /**
   * Salva um agendamento (cria ou atualiza)
   */
  save(appointment: Appointment): Promise<void>

  /**
   * Remove um agendamento
   */
  delete(id: string): Promise<void>
}
