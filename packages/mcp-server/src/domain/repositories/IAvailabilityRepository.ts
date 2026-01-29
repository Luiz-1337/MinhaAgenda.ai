import { TimeSlot } from "../entities"

export interface AvailabilityRule {
  id: string
  professionalId: string
  dayOfWeek: number // 0-6
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  isBreak: boolean
}

export interface ScheduleOverride {
  id: string
  salonId: string
  professionalId?: string
  startTime: Date
  endTime: Date
  reason?: string
}

/**
 * Interface para persistência de disponibilidade
 */
export interface IAvailabilityRepository {
  /**
   * Busca regras de disponibilidade de um profissional
   */
  findByProfessional(professionalId: string): Promise<AvailabilityRule[]>

  /**
   * Busca regras de disponibilidade para um dia da semana
   */
  findByProfessionalAndDay(
    professionalId: string,
    dayOfWeek: number
  ): Promise<AvailabilityRule[]>

  /**
   * Busca exceções de agenda (folgas, bloqueios)
   */
  findOverrides(salonId: string, startDate: Date, endDate: Date): Promise<ScheduleOverride[]>

  /**
   * Busca exceções de um profissional específico
   */
  findOverridesByProfessional(
    professionalId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleOverride[]>

  /**
   * Gera slots disponíveis para um profissional em uma data
   */
  generateSlots(
    professionalId: string,
    date: Date,
    slotDuration: number
  ): Promise<TimeSlot[]>

  /**
   * Salva uma regra de disponibilidade
   */
  saveRule(rule: AvailabilityRule): Promise<void>

  /**
   * Remove uma regra de disponibilidade
   */
  deleteRule(id: string): Promise<void>

  /**
   * Salva uma exceção de agenda
   */
  saveOverride(override: ScheduleOverride): Promise<void>

  /**
   * Remove uma exceção de agenda
   */
  deleteOverride(id: string): Promise<void>
}
