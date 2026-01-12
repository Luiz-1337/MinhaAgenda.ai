/**
 * Repository para disponibilidade de profissionais (INFRASTRUCTURE LAYER)
 */

import { eq } from "drizzle-orm"
import { db, availability, professionals } from "@repo/db"

export interface AvailabilityRow {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface AvailabilityInsert {
  professionalId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  isBreak: boolean
}

export class AvailabilityRepository {
  /**
   * Busca disponibilidade de um profissional
   */
  static async findByProfessionalId(professionalId: string): Promise<AvailabilityRow[]> {
    const rows = await db.query.availability.findMany({
      where: eq(availability.professionalId, professionalId),
      columns: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
      },
      orderBy: (availability, { asc }) => [asc(availability.dayOfWeek)],
    })

    return rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
    }))
  }

  /**
   * Busca disponibilidade de um profissional (apenas horários ativos, não breaks)
   */
  static async findActiveByProfessionalId(professionalId: string): Promise<AvailabilityRow[]> {
    const rows = await db.query.availability.findMany({
      where: eq(availability.professionalId, professionalId),
      columns: {
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isBreak: true,
      },
    })

    return rows
      .filter((row) => !row.isBreak)
      .map((row) => ({
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
      }))
  }

  /**
   * Remove toda a disponibilidade de um profissional
   */
  static async deleteByProfessionalId(professionalId: string): Promise<void> {
    await db.delete(availability).where(eq(availability.professionalId, professionalId))
  }

  /**
   * Insere múltiplos horários de disponibilidade
   */
  static async insertMany(items: AvailabilityInsert[]): Promise<void> {
    if (items.length === 0) {
      return
    }

    await db.insert(availability).values(items)
  }

  /**
   * Verifica se profissional pertence ao salão
   */
  static async professionalBelongsToSalon(
    professionalId: string,
    salonId: string
  ): Promise<boolean> {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, professionalId),
      columns: { salonId: true },
    })

    return professional?.salonId === salonId
  }
}
