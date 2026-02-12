import { Result, ok, fail } from "../../../shared/types"
import { formatDate, getDayOfWeek, formatTime, toBrazilDate, toBrazilTime } from "../../../shared/utils/date.utils"
import { SLOT_DURATION } from "../../../shared/constants"
import { DomainError } from "../../../domain/errors"
import { TimeSlot } from "../../../domain/entities"
import { DateRange } from "../../../domain/value-objects"
import {
  IAppointmentRepository,
  IAvailabilityRepository,
  ISalonRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { ICalendarService, IExternalScheduler } from "../../ports"
import { AvailabilityDTO, CheckAvailabilityDTO, TimeSlotDTO } from "../../dtos"

export class CheckAvailabilityUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private availabilityRepo: IAvailabilityRepository,
    private salonRepo: ISalonRepository,
    private serviceRepo: IServiceRepository,
    private calendarService?: ICalendarService,
    private externalScheduler?: IExternalScheduler
  ) { }

  async execute(
    input: CheckAvailabilityDTO
  ): Promise<Result<AvailabilityDTO, DomainError>> {
    const date = new Date(input.date)

    console.log("[AVAILABILITY] Input recebido:", {
      date: input.date,
      parsedDate: date.toISOString(),
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      serviceDuration: input.serviceDuration,
    })

    // Determinar duração do serviço
    let serviceDuration = input.serviceDuration ?? SLOT_DURATION
    if (input.serviceId) {
      const service = await this.serviceRepo.findById(input.serviceId)
      if (service) {
        serviceDuration = service.durationMinutes
        console.log("[AVAILABILITY] Duração do serviço:", serviceDuration, "min")
      }
    }

    // Gerar slots base a partir das regras de disponibilidade
    let baseSlots: TimeSlot[] = []

    if (input.professionalId) {
      baseSlots = await this.availabilityRepo.generateSlots(
        input.professionalId,
        date,
        serviceDuration
      )
      console.log("[AVAILABILITY] Slots gerados para profissional:", baseSlots.length)
    }

    // Se não tem slots do profissional ou não especificou profissional, usa horário do salão
    if (baseSlots.length === 0) {
      const salon = await this.salonRepo.findById(input.salonId)
      if (salon) {
        const dayOfWeek = getDayOfWeek(date)
        const workHours = salon.getWorkingHoursForDay(dayOfWeek)
        console.log("[AVAILABILITY] Dia da semana (Brasília):", dayOfWeek, "| Horário do salão:", workHours)

        if (workHours) {
          baseSlots = this.generateSlotsFromWorkHours(
            date,
            workHours.start,
            workHours.end,
            serviceDuration,
            input.professionalId
          )
          console.log("[AVAILABILITY] Slots gerados do salão:", baseSlots.length)
        } else {
          console.log("[AVAILABILITY] Salão fechado neste dia da semana")
        }
      }
    }

    // Buscar agendamentos existentes para marcar como ocupados
    if (input.professionalId) {
      const appointments = await this.appointmentRepo.findByProfessionalAndDate(input.professionalId, date)
      console.log("[AVAILABILITY] Agendamentos existentes:", appointments.length)

      // Marcar slots ocupados por agendamentos
      for (const appointment of appointments) {
        for (const slot of baseSlots) {
          if (slot.overlaps(new TimeSlot({
            start: appointment.startsAt,
            end: appointment.endsAt,
            available: false,
          }))) {
            slot.markUnavailable()
          }
        }
      }
    }

    // Buscar FreeBusy do Google Calendar (se configurado)
    if (this.calendarService && input.professionalId) {
      try {
        const isConfigured = await this.calendarService.isConfigured(input.salonId)
        console.log("[AVAILABILITY] Google Calendar configurado:", isConfigured)

        if (isConfigured) {
          const { startOfDay, endOfDay } = await import("../../../shared/utils/date.utils")
          const dayStart = startOfDay(date)
          const dayEnd = endOfDay(date)

          // Usar o professionalId como calendarId (a implementação interna resolve)
          const busyPeriods = await this.calendarService.getFreeBusy(
            input.professionalId,
            dayStart,
            dayEnd
          )

          console.log("[AVAILABILITY] Períodos ocupados no Google Calendar:", busyPeriods.length)

          // Marcar slots que conflitam com períodos ocupados
          for (const busy of busyPeriods) {
            for (const slot of baseSlots) {
              if (slot.dateRange.overlaps(busy)) {
                slot.markUnavailable()
              }
            }
          }
        }
      } catch (error) {
        console.warn("[AVAILABILITY] Erro ao buscar Google Calendar FreeBusy:", error)
        // Não falha - apenas ignora o calendário
      }
    }

    // Buscar slots ocupados do Trinks (se configurado)
    if (this.externalScheduler && input.professionalId) {
      try {
        const isConfigured = await this.externalScheduler.isConfigured(input.salonId)
        if (isConfigured) {
          const { startOfDay, endOfDay } = await import("../../../shared/utils/date.utils")
          const dayStart = startOfDay(date)
          const dayEnd = endOfDay(date)

          const busySlots = await this.externalScheduler.getBusySlots(
            input.professionalId,
            dayStart,
            dayEnd
          )

          console.log("[AVAILABILITY] Slots ocupados no Trinks:", busySlots.length)

          for (const busy of busySlots) {
            for (const slot of baseSlots) {
              if (slot.overlaps(busy)) {
                slot.markUnavailable()
              }
            }
          }
        }
      } catch (error) {
        console.warn("[AVAILABILITY] Erro ao buscar Trinks:", error)
      }
    }

    // Filtrar slots que já passaram (se for hoje)
    const now = new Date()
    const nowBrazil = toBrazilDate(now)
    const dateBrazil = toBrazilDate(date)
    const isToday =
      dateBrazil.getFullYear() === nowBrazil.getFullYear() &&
      dateBrazil.getMonth() === nowBrazil.getMonth() &&
      dateBrazil.getDate() === nowBrazil.getDate()

    if (isToday) {
      console.log("[AVAILABILITY] É hoje - filtrando slots passados (agora UTC:", now.toISOString(), ")")
    }

    // Converter para DTOs
    const slotDTOs: TimeSlotDTO[] = baseSlots.map((slot) => {
      // Se for hoje e o slot já passou, marca como indisponível
      const isPast = isToday && slot.start <= now
      return {
        time: slot.formatStartTime(),
        available: !isPast && slot.available && slot.canFit(serviceDuration),
        professionalId: slot.professionalId,
      }
    })

    const totalAvailable = slotDTOs.filter((s) => s.available).length
    const message =
      totalAvailable === 0
        ? "Não há horários disponíveis nesta data"
        : `${totalAvailable} horário(s) disponível(is)`

    console.log("[AVAILABILITY] Resultado final:", { totalSlots: slotDTOs.length, totalAvailable })

    return ok({
      date: formatDate(date),
      dateISO: date.toISOString(),
      professionalId: input.professionalId,
      slots: slotDTOs,
      totalAvailable,
      message,
    })
  }

  /**
   * Gera slots a partir do horário de funcionamento do salão,
   * usando timezone de Brasília para criar os horários corretos.
   */
  private generateSlotsFromWorkHours(
    date: Date,
    startTime: string,
    endTime: string,
    slotDuration: number,
    professionalId?: string
  ): TimeSlot[] {
    const slots: TimeSlot[] = []

    // Extrair componentes da data em Brasília
    const brazilDate = toBrazilDate(date)
    const baseYear = brazilDate.getFullYear()
    const baseMonth = brazilDate.getMonth()
    const baseDay = brazilDate.getDate()

    const [startHour, startMin] = startTime.split(":").map(Number)
    const [endHour, endMin] = endTime.split(":").map(Number)

    const startMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += slotDuration) {
      const slotHour = Math.floor(minutes / 60)
      const slotMin = minutes % 60

      // Cria horário em Brasília e converte para UTC
      const slotStartBrazil = new Date(baseYear, baseMonth, baseDay, slotHour, slotMin, 0, 0)
      const slotStart = toBrazilTime(slotStartBrazil)

      const endMinutesTotal = minutes + slotDuration
      const endHourSlot = Math.floor(endMinutesTotal / 60)
      const endMinSlot = endMinutesTotal % 60
      const slotEndBrazil = new Date(baseYear, baseMonth, baseDay, endHourSlot, endMinSlot, 0, 0)
      const slotEnd = toBrazilTime(slotEndBrazil)

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
