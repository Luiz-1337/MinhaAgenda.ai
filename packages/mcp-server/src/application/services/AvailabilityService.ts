import { TimeSlot } from "../../domain/entities"
import { DateRange } from "../../domain/value-objects"
import {
  IAppointmentRepository,
  IAvailabilityRepository,
  ISalonRepository,
} from "../../domain/repositories"
import { ICalendarService, IExternalScheduler } from "../ports"
import { SLOT_DURATION } from "../../shared/constants"
import { startOfDay, endOfDay, getDayOfWeek } from "../../shared/utils/date.utils"

/**
 * Serviço que combina múltiplas fontes de disponibilidade
 */
export class AvailabilityService {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private availabilityRepo: IAvailabilityRepository,
    private salonRepo: ISalonRepository,
    private calendarService?: ICalendarService,
    private externalScheduler?: IExternalScheduler
  ) {}

  /**
   * Calcula disponibilidade combinando todas as fontes
   */
  async calculateAvailability(
    salonId: string,
    professionalId: string,
    date: Date,
    serviceDuration: number = SLOT_DURATION
  ): Promise<TimeSlot[]> {
    const dayStart = startOfDay(date)
    const dayEnd = endOfDay(date)

    // 1. Gerar slots base a partir das regras de disponibilidade
    let baseSlots = await this.availabilityRepo.generateSlots(
      professionalId,
      date,
      SLOT_DURATION
    )

    // Se não tem regras de disponibilidade, usar horário do salão
    if (baseSlots.length === 0) {
      const salon = await this.salonRepo.findById(salonId)
      if (salon) {
        const dayOfWeek = getDayOfWeek(date)
        const workHours = salon.getWorkingHoursForDay(dayOfWeek)
        if (workHours) {
          baseSlots = this.generateSlotsFromWorkHours(
            date,
            workHours.start,
            workHours.end,
            SLOT_DURATION,
            professionalId
          )
        }
      }
    }

    // 2. Buscar agendamentos existentes no banco
    const appointments = await this.appointmentRepo.findByProfessionalAndDate(
      professionalId,
      date
    )

    // Marcar slots ocupados por agendamentos
    for (const appointment of appointments) {
      const appointmentRange = new DateRange(appointment.startsAt, appointment.endsAt)
      for (const slot of baseSlots) {
        if (slot.dateRange.overlaps(appointmentRange)) {
          slot.markUnavailable()
        }
      }
    }

    // 3. Buscar FreeBusy do Google Calendar (se configurado)
    if (this.calendarService) {
      try {
        const isConfigured = await this.calendarService.isConfigured(salonId)
        if (isConfigured) {
          // Buscar calendarId do profissional
          // TODO: Implementar busca do calendarId
          // const busyPeriods = await this.calendarService.getFreeBusy(calendarId, dayStart, dayEnd)
          // for (const busy of busyPeriods) {
          //   for (const slot of baseSlots) {
          //     if (slot.dateRange.overlaps(busy)) {
          //       slot.markUnavailable()
          //     }
          //   }
          // }
        }
      } catch (error) {
        console.warn("Erro ao buscar disponibilidade do Google Calendar:", error)
      }
    }

    // 4. Buscar slots ocupados do Trinks (se configurado)
    if (this.externalScheduler) {
      try {
        const isConfigured = await this.externalScheduler.isConfigured(salonId)
        if (isConfigured) {
          const busySlots = await this.externalScheduler.getBusySlots(
            professionalId,
            dayStart,
            dayEnd
          )
          for (const busy of busySlots) {
            for (const slot of baseSlots) {
              if (slot.overlaps(busy)) {
                slot.markUnavailable()
              }
            }
          }
        }
      } catch (error) {
        console.warn("Erro ao buscar disponibilidade do Trinks:", error)
      }
    }

    // 5. Filtrar slots que podem acomodar a duração do serviço
    // e que ainda não passaram (se for hoje)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    return baseSlots.filter((slot) => {
      // Se for hoje, filtra slots passados
      if (isToday && slot.start <= now) {
        return false
      }

      // Verifica se o slot pode acomodar o serviço
      return slot.canFit(serviceDuration)
    })
  }

  /**
   * Verifica se um horário específico está disponível
   */
  async isSlotAvailable(
    salonId: string,
    professionalId: string,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean> {
    // Verificar conflitos no banco
    const conflicts = await this.appointmentRepo.findConflicting(
      professionalId,
      startsAt,
      endsAt
    )

    if (conflicts.length > 0) {
      return false
    }

    // Verificar no Google Calendar
    if (this.calendarService) {
      try {
        const isConfigured = await this.calendarService.isConfigured(salonId)
        if (isConfigured) {
          // TODO: Implementar verificação específica de horário
        }
      } catch {
        // Ignora erro - assume disponível
      }
    }

    // Verificar no Trinks
    if (this.externalScheduler) {
      try {
        const isConfigured = await this.externalScheduler.isConfigured(salonId)
        if (isConfigured) {
          const busySlots = await this.externalScheduler.getBusySlots(
            professionalId,
            startsAt,
            endsAt
          )
          if (busySlots.length > 0) {
            return false
          }
        }
      } catch {
        // Ignora erro - assume disponível
      }
    }

    return true
  }

  private generateSlotsFromWorkHours(
    date: Date,
    startTime: string,
    endTime: string,
    slotDuration: number,
    professionalId?: string
  ): TimeSlot[] {
    const slots: TimeSlot[] = []
    const baseDate = startOfDay(date)

    const [startHour, startMin] = startTime.split(":").map(Number)
    const [endHour, endMin] = endTime.split(":").map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += slotDuration) {
      const slotStart = new Date(baseDate)
      slotStart.setMinutes(slotStart.getMinutes() + minutes)

      const slotEnd = new Date(baseDate)
      slotEnd.setMinutes(slotEnd.getMinutes() + minutes + slotDuration)

      slots.push(
        new TimeSlot({
          start: slotStart,
          end: slotEnd,
          available: true,
          professionalId,
        })
      )
    }

    return slots
  }
}
