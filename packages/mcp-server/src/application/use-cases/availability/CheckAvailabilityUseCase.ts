import { Result, ok, fail } from "../../../shared/types"
import { formatDate, getDayOfWeek, startOfDay, endOfDay, formatTime } from "../../../shared/utils/date.utils"
import { SLOT_DURATION } from "../../../shared/constants"
import { DomainError } from "../../../domain/errors"
import { TimeSlot } from "../../../domain/entities"
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
  ) {}

  async execute(
    input: CheckAvailabilityDTO
  ): Promise<Result<AvailabilityDTO, DomainError>> {
    const date = new Date(input.date)
    const dayStart = startOfDay(date)
    const dayEnd = endOfDay(date)

    // Determinar duração do serviço
    let serviceDuration = input.serviceDuration ?? SLOT_DURATION
    if (input.serviceId) {
      const service = await this.serviceRepo.findById(input.serviceId)
      if (service) {
        serviceDuration = service.durationMinutes
      }
    }

    // Gerar slots base a partir das regras de disponibilidade
    let baseSlots: TimeSlot[] = []

    if (input.professionalId) {
      baseSlots = await this.availabilityRepo.generateSlots(
        input.professionalId,
        date,
        SLOT_DURATION
      )
    } else {
      // Se não especificou profissional, usa horário do salão
      const salon = await this.salonRepo.findById(input.salonId)
      if (salon) {
        const dayOfWeek = getDayOfWeek(date)
        const workHours = salon.getWorkingHoursForDay(dayOfWeek)
        if (workHours) {
          // Gera slots a partir do horário do salão
          baseSlots = this.generateSlotsFromWorkHours(
            date,
            workHours.start,
            workHours.end,
            SLOT_DURATION
          )
        }
      }
    }

    // Buscar agendamentos existentes
    const appointments = input.professionalId
      ? await this.appointmentRepo.findByProfessionalAndDate(input.professionalId, date)
      : []

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

    // Se tiver integração com calendário, verificar FreeBusy
    // (implementação simplificada - pode ser expandida)

    // Filtrar slots que podem acomodar a duração do serviço
    const availableSlots = baseSlots.filter((slot) => slot.canFit(serviceDuration))

    // Converter para DTOs
    const slotDTOs: TimeSlotDTO[] = baseSlots.map((slot) => ({
      time: slot.formatStartTime(),
      available: slot.available && slot.canFit(serviceDuration),
      professionalId: slot.professionalId,
    }))

    const totalAvailable = slotDTOs.filter((s) => s.available).length
    const message =
      totalAvailable === 0
        ? "Não há horários disponíveis nesta data"
        : `${totalAvailable} horário(s) disponível(is)`

    return ok({
      date: formatDate(date),
      dateISO: date.toISOString(),
      professionalId: input.professionalId,
      slots: slotDTOs,
      totalAvailable,
      message,
    })
  }

  private generateSlotsFromWorkHours(
    date: Date,
    startTime: string,
    endTime: string,
    slotDuration: number
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
        })
      )
    }

    return slots
  }
}
