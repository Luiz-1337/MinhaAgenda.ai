import { isWeekdayAllowed, timeToMinutes } from "@repo/db"
import { Result, ok, fail } from "../../../shared/types"
import { formatDate, getDayOfWeek, toBrazilDate, toBrazilTime } from "../../../shared/utils/date.utils"
import { SLOT_DURATION } from "../../../shared/constants"
import { DomainError } from "../../../domain/errors"
import { TimeSlot } from "../../../domain/entities"

import {
  IAppointmentRepository,
  IAvailabilityRepository,
  IProfessionalRepository,
  ISalonRepository,
  IServiceRepository,
} from "../../../domain/repositories"
import { ICalendarService, IExternalScheduler } from "../../ports"
import { AvailabilityDTO, CheckAvailabilityDTO, TimeSlotDTO } from "../../dtos"

/** Regras de agenda do serviço (dias permitidos / horários de início específicos). */
type ServiceScheduleConfig = { allowedWeekdays?: number[] | null; allowedStartTimes?: string[] | null }

export class CheckAvailabilityUseCase {
  constructor(
    private appointmentRepo: IAppointmentRepository,
    private availabilityRepo: IAvailabilityRepository,
    private salonRepo: ISalonRepository,
    private serviceRepo: IServiceRepository,
    private calendarService?: ICalendarService,
    private externalScheduler?: IExternalScheduler,
    private professionalRepo?: IProfessionalRepository
  ) { }

  async execute(
    input: CheckAvailabilityDTO
  ): Promise<Result<AvailabilityDTO, DomainError>> {
    const date = new Date(input.date)

    // Determinar duração do serviço e as regras de agenda do serviço (dias/horários)
    let serviceDuration = input.serviceDuration ?? SLOT_DURATION
    let serviceConfig: ServiceScheduleConfig | undefined
    if (input.serviceId) {
      const service = await this.serviceRepo.findById(input.serviceId)
      if (service) {
        // Reserva o MAIOR tempo da faixa, alinhado com a validação de booking.
        serviceDuration = service.blockingDurationMinutes
        serviceConfig = service.getScheduleConfig()
      }
    }

    // CASO 1: profissional específico — calcula os slots desse profissional, já
    // subtraindo o que ele tem ocupado em QUALQUER salão (cross-salão).
    if (input.professionalId) {
      const slots = await this.computeProfessionalSlots(
        input.professionalId,
        input.salonId,
        date,
        serviceDuration,
        { fallbackToSalonHours: true },
        serviceConfig
      )
      return ok(this.buildDTO(date, slots, serviceDuration, { professionalId: input.professionalId }))
    }

    // CASO 2: sem profissional, mas com serviço — agrega os horários de quem FAZ o
    // serviço (especialistas primeiro), atribuindo o profissional a cada horário.
    if (input.serviceId && this.professionalRepo) {
      const capable = await this.professionalRepo.findByServiceWithSpecialist(
        input.serviceId,
        input.salonId
      )

      if (capable.length > 0) {
        // Especialistas primeiro (os demais capazes seguem como opção).
        const ordered = [...capable].sort(
          (a, b) => Number(b.isSpecialist) - Number(a.isSpecialist)
        )

        const meta = new Map<string, { name: string; isSpecialist: boolean }>()
        const perProSlots = await Promise.all(
          ordered.map(async ({ professional, isSpecialist }) => {
            meta.set(professional.id, { name: professional.name, isSpecialist })
            return this.computeProfessionalSlots(
              professional.id,
              input.salonId,
              date,
              serviceDuration,
              { fallbackToSalonHours: false },
              serviceConfig
            )
          })
        )

        return ok(this.buildDTO(date, perProSlots.flat(), serviceDuration, { meta }))
      }
    }

    // CASO 3: fallback — sem profissional e sem serviço (ou ninguém faz o serviço):
    // usa o horário de funcionamento do salão, sem subtrair ocupação (comportamento antigo).
    const salonSlots = await this.generateSalonHoursSlots(
      date,
      input.salonId,
      serviceDuration,
      undefined,
      serviceConfig
    )
    return ok(this.buildDTO(date, salonSlots, serviceDuration, {}))
  }

  /**
   * Calcula os slots de UM profissional: gera a partir das regras de trabalho,
   * subtrai os agendamentos da PESSOA (cross-salão) e o free/busy do Google/Trinks.
   * Não filtra horários passados — isso é feito em {@link buildDTO}.
   */
  private async computeProfessionalSlots(
    professionalId: string,
    salonId: string,
    date: Date,
    serviceDuration: number,
    opts: { fallbackToSalonHours: boolean },
    serviceConfig?: ServiceScheduleConfig
  ): Promise<TimeSlot[]> {
    let baseSlots = await this.availabilityRepo.generateSlots(professionalId, date, serviceDuration, serviceConfig)

    if (baseSlots.length === 0 && opts.fallbackToSalonHours) {
      baseSlots = await this.generateSalonHoursSlots(date, salonId, serviceDuration, professionalId, serviceConfig)
    }

    if (baseSlots.length === 0) {
      return baseSlots
    }

    // Marca como ocupado o que a PESSOA já tem agendado em qualquer salão (cross-salão).
    const personAppointments = await this.appointmentRepo.findByPersonAndDate(professionalId, date)
    for (const appointment of personAppointments) {
      for (const slot of baseSlots) {
        if (
          slot.overlaps(
            new TimeSlot({ start: appointment.startsAt, end: appointment.endsAt, available: false })
          )
        ) {
          slot.markUnavailable()
        }
      }
    }

    // Free/busy externo (Google Calendar e Trinks) — fail-open
    const { startOfDay, endOfDay } = await import("../../../shared/utils/date.utils")
    const dayStart = startOfDay(date)
    const dayEnd = endOfDay(date)
    const externalFetches: Promise<void>[] = []

    if (this.calendarService) {
      externalFetches.push(
        (async () => {
          try {
            const isConfigured = await this.calendarService!.isConfigured(salonId)
            if (isConfigured) {
              const busyPeriods = await this.calendarService!.getFreeBusy(professionalId, dayStart, dayEnd)
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
          }
        })()
      )
    }

    if (this.externalScheduler) {
      externalFetches.push(
        (async () => {
          try {
            const isConfigured = await this.externalScheduler!.isConfigured(salonId)
            if (isConfigured) {
              const busySlots = await this.externalScheduler!.getBusySlots(professionalId, dayStart, dayEnd)
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
        })()
      )
    }

    await Promise.all(externalFetches)

    return baseSlots
  }

  /**
   * Gera slots a partir do horário de funcionamento do salão (sem subtrair ocupação).
   */
  private async generateSalonHoursSlots(
    date: Date,
    salonId: string,
    serviceDuration: number,
    professionalId?: string,
    serviceConfig?: ServiceScheduleConfig
  ): Promise<TimeSlot[]> {
    const salon = await this.salonRepo.findById(salonId)
    if (!salon) return []

    const dayOfWeek = getDayOfWeek(date)

    // Serviço não atendido neste dia da semana → sem horários.
    if (serviceConfig && !isWeekdayAllowed(serviceConfig.allowedWeekdays, dayOfWeek)) {
      return []
    }

    const workHours = salon.getWorkingHoursForDay(dayOfWeek)
    if (!workHours) return []

    return this.generateSlotsFromWorkHours(
      date,
      workHours.start,
      workHours.end,
      serviceDuration,
      professionalId,
      serviceConfig
    )
  }

  /**
   * Converte TimeSlots em DTOs, filtrando horários passados (se for hoje) e anexando
   * a atribuição de profissional (nome/especialista) quando disponível.
   */
  private buildDTO(
    date: Date,
    baseSlots: TimeSlot[],
    serviceDuration: number,
    attribution: {
      professionalId?: string
      meta?: Map<string, { name: string; isSpecialist: boolean }>
    }
  ): AvailabilityDTO {
    const now = new Date()
    const nowBrazil = toBrazilDate(now)
    const dateBrazil = toBrazilDate(date)
    const isToday =
      dateBrazil.getFullYear() === nowBrazil.getFullYear() &&
      dateBrazil.getMonth() === nowBrazil.getMonth() &&
      dateBrazil.getDate() === nowBrazil.getDate()

    const slots: TimeSlotDTO[] = baseSlots.map((slot) => {
      // Se for hoje e o slot já passou, marca como indisponível.
      // Usa nowBrazil (ajustado) para comparar no mesmo espaço de tempo que slot.start.
      const isPast = isToday && slot.start <= nowBrazil
      const m = slot.professionalId ? attribution.meta?.get(slot.professionalId) : undefined
      return {
        time: slot.formatStartTime(),
        available: !isPast && slot.available && slot.canFit(serviceDuration),
        professionalId: slot.professionalId,
        professionalName: m?.name,
        isSpecialist: m?.isSpecialist,
      }
    })

    const totalAvailable = slots.filter((s) => s.available).length
    const message =
      totalAvailable === 0
        ? "Não há horários disponíveis nesta data"
        : `${totalAvailable} horário(s) disponível(is)`

    return {
      date: formatDate(date),
      dateISO: date.toISOString(),
      professionalId: attribution.professionalId,
      slots,
      totalAvailable,
      message,
    }
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
    professionalId?: string,
    serviceConfig?: ServiceScheduleConfig
  ): TimeSlot[] {
    const slots: TimeSlot[] = []

    // Extrair componentes da data em Brasília
    const brazilDate = toBrazilDate(date)
    const baseYear = brazilDate.getFullYear()
    const baseMonth = brazilDate.getMonth()
    const baseDay = brazilDate.getDate()

    const startMinutes = timeToMinutes(startTime)
    const endMinutes = timeToMinutes(endTime)

    const buildSlot = (minutes: number): TimeSlot => {
      const slotHour = Math.floor(minutes / 60)
      const slotMin = minutes % 60
      const slotStartBrazil = new Date(baseYear, baseMonth, baseDay, slotHour, slotMin, 0, 0)
      const slotStart = toBrazilTime(slotStartBrazil)

      const endMinutesTotal = minutes + slotDuration
      const endHourSlot = Math.floor(endMinutesTotal / 60)
      const endMinSlot = endMinutesTotal % 60
      const slotEndBrazil = new Date(baseYear, baseMonth, baseDay, endHourSlot, endMinSlot, 0, 0)
      const slotEnd = toBrazilTime(slotEndBrazil)

      return new TimeSlot({ start: slotStart, end: slotEnd, available: true, professionalId })
    }

    // Modo horários específicos por serviço: só os horários listados que cabem na janela.
    const discreteStartTimes =
      serviceConfig?.allowedStartTimes && serviceConfig.allowedStartTimes.length > 0
        ? serviceConfig.allowedStartTimes
        : null

    if (discreteStartTimes) {
      const seen = new Set<number>()
      for (const time of discreteStartTimes) {
        const minutes = timeToMinutes(time)
        if (seen.has(minutes)) continue
        if (minutes < startMinutes || minutes + slotDuration > endMinutes) continue
        seen.add(minutes)
        slots.push(buildSlot(minutes))
      }
      return slots
    }

    for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += slotDuration) {
      slots.push(buildSlot(minutes))
    }

    return slots
  }
}
