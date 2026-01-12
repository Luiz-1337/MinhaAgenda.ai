/**
 * Validador para horários de disponibilidade (DOMAIN LAYER)
 */

import { z } from "zod"
import { isValidTimeRange } from "@/lib/services/validation.service"

export interface ScheduleItem {
  dayOfWeek: number
  startTime: string
  endTime: string
  isActive: boolean
}

export const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  isActive: z.boolean(),
})

export class ScheduleValidator {
  /**
   * Valida um array de itens de schedule
   */
  static validateSchedule(schedule: unknown[]): ScheduleItem[] {
    const parsed = z.array(scheduleItemSchema).safeParse(schedule)
    if (!parsed.success) {
      throw new Error("Formato de horários inválido")
    }

    for (const item of parsed.data) {
      if (item.isActive && !isValidTimeRange(item.startTime, item.endTime)) {
        throw new Error("Horário inválido: início deve ser anterior ao fim")
      }
    }

    return parsed.data
  }

  /**
   * Filtra apenas itens ativos
   */
  static filterActive(schedule: ScheduleItem[]): ScheduleItem[] {
    return schedule.filter((item) => item.isActive)
  }
}
