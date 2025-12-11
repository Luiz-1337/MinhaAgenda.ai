/**
 * Tipos relacionados a disponibilidade e agendamento
 */

export interface AvailabilityItem {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface ScheduleItem {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export interface WorkHoursDay {
  start: string
  end: string
}

export type WorkHours = Record<string, WorkHoursDay>

export interface GetAvailableSlotsInput {
  date: Date | string
  salonId: string
  serviceDuration: number
  professionalId?: string
}

export interface TimeSlot {
  start: Date
  end: Date
}
