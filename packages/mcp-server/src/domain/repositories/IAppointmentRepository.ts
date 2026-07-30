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
   * Busca agendamentos de um cliente em um salão.
   * Cancelados ficam fora por padrão.
   */
  findByCustomer(
    customerId: string,
    salonId: string,
    includeCancelled?: boolean
  ): Promise<Appointment[]>

  /**
   * Busca agendamentos de um profissional em uma data
   */
  findByProfessionalAndDate(professionalId: string, date: Date): Promise<Appointment[]>

  /**
   * Busca agendamentos de uma PESSOA em uma data: resolve internamente todas as
   * linhas de profissional do mesmo person_key (cruzando salões) e retorna seus
   * agendamentos. Usado para marcar como ocupado os horários em que a pessoa já
   * atende em outro salão.
   */
  findByPersonAndDate(professionalId: string, date: Date): Promise<Appointment[]>

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

  // Não existe `delete` aqui de propósito. O cancelamento real passa por
  // `domainServices.deleteAppointmentService` (@repo/db), que é o único lugar que
  // sabe desfazer o evento espelhado no Google/Trinks e tentar preencher a vaga
  // pela fila de espera. O método existia sem nenhum chamador e, depois do soft
  // delete, seria a rota mais fácil para apagar histórico por engano.
}
