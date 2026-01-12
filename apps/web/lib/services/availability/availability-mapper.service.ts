/**
 * Mapper para transformação de dados de disponibilidade (INFRASTRUCTURE LAYER)
 */

import type { AvailabilityInsert, AvailabilityRow } from "./availability.repository"
import type { ScheduleItem } from "./schedule-validator.service"
import type { AvailabilityItem } from "@/lib/types/availability"

export class AvailabilityMapper {
  /**
   * Converte ScheduleItem para formato do banco (AvailabilityInsert)
   */
  static toInsert(professionalId: string, item: ScheduleItem): AvailabilityInsert {
    return {
      professionalId,
      dayOfWeek: item.dayOfWeek,
      startTime: item.startTime,
      endTime: item.endTime,
      isBreak: false,
    }
  }

  /**
   * Converte AvailabilityRow para AvailabilityItem (formato da API)
   */
  static toAvailabilityItem(row: AvailabilityRow): AvailabilityItem {
    return {
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
    }
  }

  /**
   * Converte array de AvailabilityRow para AvailabilityItem[]
   */
  static toAvailabilityItems(rows: AvailabilityRow[]): AvailabilityItem[] {
    return rows.map((row) => this.toAvailabilityItem(row))
  }
}
