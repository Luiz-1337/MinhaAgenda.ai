import { db, availability, scheduleOverrides, and, eq, gte, lte, isWeekdayAllowed, timeToMinutes } from "@repo/db"
import {
  IAvailabilityRepository,
  AvailabilityRule,
  ScheduleOverride,
} from "../../domain/repositories"
import { TimeSlot } from "../../domain/entities"
import { SLOT_DURATION } from "../../shared/constants"
import { getDayOfWeek, toBrazilDate, toBrazilTime } from "../../shared/utils/date.utils"
import { InMemoryCache } from "../cache"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Implementação do repositório de disponibilidade usando Drizzle ORM
 */
export class DrizzleAvailabilityRepository implements IAvailabilityRepository {
  private rulesCache = new InMemoryCache<AvailabilityRule[]>(CACHE_TTL)

  async findByProfessional(professionalId: string): Promise<AvailabilityRule[]> {
    const cached = this.rulesCache.get(professionalId)
    if (cached !== undefined) return cached

    const rows = await db.query.availability.findMany({
      where: eq(availability.professionalId, professionalId),
      orderBy: (availability, { asc }) => [
        asc(availability.dayOfWeek),
        asc(availability.startTime),
      ],
    })

    const rules = rows.map((row) => ({
      id: row.id,
      professionalId: row.professionalId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isBreak: row.isBreak,
    }))

    this.rulesCache.set(professionalId, rules)
    return rules
  }

  async findByProfessionalAndDay(
    professionalId: string,
    dayOfWeek: number
  ): Promise<AvailabilityRule[]> {
    const cacheKey = `${professionalId}:${dayOfWeek}`
    const cached = this.rulesCache.get(cacheKey)
    if (cached !== undefined) return cached

    const rows = await db.query.availability.findMany({
      where: and(
        eq(availability.professionalId, professionalId),
        eq(availability.dayOfWeek, dayOfWeek)
      ),
      orderBy: (availability, { asc }) => [asc(availability.startTime)],
    })

    const rules = rows.map((row) => ({
      id: row.id,
      professionalId: row.professionalId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isBreak: row.isBreak,
    }))

    this.rulesCache.set(cacheKey, rules)
    return rules
  }

  async findOverrides(
    salonId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleOverride[]> {
    const rows = await db.query.scheduleOverrides.findMany({
      where: and(
        eq(scheduleOverrides.salonId, salonId),
        gte(scheduleOverrides.startTime, startDate),
        lte(scheduleOverrides.endTime, endDate)
      ),
    })

    return rows.map((row) => ({
      id: row.id,
      salonId: row.salonId ?? salonId, // Fallback
      professionalId: row.professionalId ?? undefined,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: row.reason ?? undefined,
    }))
  }

  async findOverridesByProfessional(
    professionalId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleOverride[]> {
    const rows = await db.query.scheduleOverrides.findMany({
      where: and(
        eq(scheduleOverrides.professionalId, professionalId),
        gte(scheduleOverrides.startTime, startDate),
        lte(scheduleOverrides.endTime, endDate)
      ),
    })

    return rows.map((row) => ({
      id: row.id,
      salonId: row.salonId ?? "", // Fallback
      professionalId: row.professionalId ?? undefined,
      startTime: row.startTime,
      endTime: row.endTime,
      reason: row.reason ?? undefined,
    }))
  }

  async generateSlots(
    professionalId: string,
    date: Date,
    slotDuration: number = SLOT_DURATION,
    serviceConfig?: { allowedWeekdays?: number[] | null; allowedStartTimes?: string[] | null }
  ): Promise<TimeSlot[]> {
    // Usar dia da semana em Brasília (não UTC)
    const dayOfWeek = getDayOfWeek(date)

    // Serviço não atendido neste dia da semana → sem horários.
    if (serviceConfig && !isWeekdayAllowed(serviceConfig.allowedWeekdays, dayOfWeek)) {
      return []
    }

    const rules = await this.findByProfessionalAndDay(professionalId, dayOfWeek)

    // Filtra regras de trabalho (não break)
    const workRules = rules.filter((r) => !r.isBreak)
    const breakRules = rules.filter((r) => r.isBreak)

    if (workRules.length === 0) {
      return []
    }

    // Pega a data no timezone de Brasília para extrair ano/mês/dia corretos
    const brazilDate = toBrazilDate(date)
    const baseYear = brazilDate.getFullYear()
    const baseMonth = brazilDate.getMonth()
    const baseDay = brazilDate.getDate()

    const isInBreak = (minutes: number): boolean =>
      breakRules.some((br) => {
        const [brStartH, brStartM] = br.startTime.split(":").map(Number)
        const [brEndH, brEndM] = br.endTime.split(":").map(Number)
        const breakStart = brStartH * 60 + brStartM
        const breakEnd = brEndH * 60 + brEndM
        return minutes >= breakStart && minutes < breakEnd
      })

    // Constrói um TimeSlot a partir do minuto inicial (Brasília → UTC).
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

      return new TimeSlot({
        start: slotStart,
        end: slotEnd,
        available: !isInBreak(minutes),
        professionalId,
      })
    }

    // Modo horários específicos por serviço: oferece SOMENTE os horários listados
    // que cabem inteiramente em alguma janela de trabalho.
    const discreteStartTimes =
      serviceConfig?.allowedStartTimes && serviceConfig.allowedStartTimes.length > 0
        ? serviceConfig.allowedStartTimes
        : null

    if (discreteStartTimes) {
      const slots: TimeSlot[] = []
      const seen = new Set<number>()
      for (const time of discreteStartTimes) {
        const minutes = timeToMinutes(time)
        if (seen.has(minutes)) continue
        const fits = workRules.some((rule) => {
          const startMinutes = timeToMinutes(rule.startTime)
          const endMinutes = timeToMinutes(rule.endTime)
          return minutes >= startMinutes && minutes + slotDuration <= endMinutes
        })
        if (!fits) continue
        seen.add(minutes)
        slots.push(buildSlot(minutes))
      }
      return slots
    }

    // Grade contínua (comportamento atual).
    const slots: TimeSlot[] = []
    for (const rule of workRules) {
      const startMinutes = timeToMinutes(rule.startTime)
      const endMinutes = timeToMinutes(rule.endTime)
      for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += slotDuration) {
        slots.push(buildSlot(minutes))
      }
    }

    return slots
  }

  async saveRule(rule: AvailabilityRule): Promise<void> {
    await db
      .insert(availability)
      .values({
        id: rule.id,
        professionalId: rule.professionalId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isBreak: rule.isBreak,
      })
      .onConflictDoUpdate({
        target: availability.id,
        set: {
          dayOfWeek: rule.dayOfWeek,
          startTime: rule.startTime,
          endTime: rule.endTime,
          isBreak: rule.isBreak,
        },
      })

    this.rulesCache.clear()
  }

  async deleteRule(id: string): Promise<void> {
    await db.delete(availability).where(eq(availability.id, id))
    this.rulesCache.clear()
  }

  async saveOverride(override: ScheduleOverride): Promise<void> {
    if (!override.professionalId) {
      throw new Error("professionalId é obrigatório para schedule overrides")
    }

    await db.insert(scheduleOverrides).values({
      salonId: override.salonId || undefined,
      professionalId: override.professionalId,
      startTime: override.startTime,
      endTime: override.endTime,
      reason: override.reason ?? undefined,
    })
  }

  async deleteOverride(id: string): Promise<void> {
    await db.delete(scheduleOverrides).where(eq(scheduleOverrides.id, id))
  }
}
