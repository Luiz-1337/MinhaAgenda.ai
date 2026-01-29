import { db, availability, scheduleOverrides, and, eq, gte, lte } from "@repo/db"
import {
  IAvailabilityRepository,
  AvailabilityRule,
  ScheduleOverride,
} from "../../domain/repositories"
import { TimeSlot } from "../../domain/entities"
import { SLOT_DURATION } from "../../shared/constants"
import { startOfDay } from "../../shared/utils/date.utils"

/**
 * Implementação do repositório de disponibilidade usando Drizzle ORM
 */
export class DrizzleAvailabilityRepository implements IAvailabilityRepository {
  async findByProfessional(professionalId: string): Promise<AvailabilityRule[]> {
    const rows = await db.query.availability.findMany({
      where: eq(availability.professionalId, professionalId),
      orderBy: (availability, { asc }) => [
        asc(availability.dayOfWeek),
        asc(availability.startTime),
      ],
    })

    return rows.map((row) => ({
      id: row.id,
      professionalId: row.professionalId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isBreak: row.isBreak,
    }))
  }

  async findByProfessionalAndDay(
    professionalId: string,
    dayOfWeek: number
  ): Promise<AvailabilityRule[]> {
    const rows = await db.query.availability.findMany({
      where: and(
        eq(availability.professionalId, professionalId),
        eq(availability.dayOfWeek, dayOfWeek)
      ),
      orderBy: (availability, { asc }) => [asc(availability.startTime)],
    })

    return rows.map((row) => ({
      id: row.id,
      professionalId: row.professionalId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isBreak: row.isBreak,
    }))
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
    slotDuration: number = SLOT_DURATION
  ): Promise<TimeSlot[]> {
    const dayOfWeek = date.getDay()
    const rules = await this.findByProfessionalAndDay(professionalId, dayOfWeek)

    // Filtra regras de trabalho (não break)
    const workRules = rules.filter((r) => !r.isBreak)
    const breakRules = rules.filter((r) => r.isBreak)

    if (workRules.length === 0) {
      return []
    }

    const slots: TimeSlot[] = []
    const baseDate = startOfDay(date)

    for (const rule of workRules) {
      const [startHour, startMin] = rule.startTime.split(":").map(Number)
      const [endHour, endMin] = rule.endTime.split(":").map(Number)

      const startMinutes = startHour * 60 + startMin
      const endMinutes = endHour * 60 + endMin

      for (let minutes = startMinutes; minutes + slotDuration <= endMinutes; minutes += slotDuration) {
        const slotStart = new Date(baseDate)
        slotStart.setMinutes(slotStart.getMinutes() + minutes)

        const slotEnd = new Date(baseDate)
        slotEnd.setMinutes(slotEnd.getMinutes() + minutes + slotDuration)

        // Verifica se está em intervalo de pausa
        const isInBreak = breakRules.some((br) => {
          const [brStartH, brStartM] = br.startTime.split(":").map(Number)
          const [brEndH, brEndM] = br.endTime.split(":").map(Number)
          const breakStart = brStartH * 60 + brStartM
          const breakEnd = brEndH * 60 + brEndM
          return minutes >= breakStart && minutes < breakEnd
        })

        slots.push(
          new TimeSlot({
            start: slotStart,
            end: slotEnd,
            available: !isInBreak,
            professionalId,
          })
        )
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
  }

  async deleteRule(id: string): Promise<void> {
    await db.delete(availability).where(eq(availability.id, id))
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
