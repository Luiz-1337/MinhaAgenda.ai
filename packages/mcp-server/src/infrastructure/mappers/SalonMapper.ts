import { Salon, SalonProps } from "../../domain/entities"
import { WeeklyWorkingHours } from "../../shared/types/common.types"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface SalonRow {
  id: string
  ownerId: string
  name: string
  slug?: string | null
  address?: string | null
  phone?: string | null
  whatsapp?: string | null
  description?: string | null
  workHours?: Record<string, { start: string; end: string }> | null
  settings?: Record<string, unknown> | null
  subscriptionStatus?: string
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Mapper para conversão entre formato do banco e entidade Salon
 */
export class SalonMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: SalonRow): Salon {
    // Converte workHours do formato do banco para WeeklyWorkingHours
    let workingHours: WeeklyWorkingHours = {}
    if (row.workHours) {
      const dayMap: Record<string, number> = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6,
        "0": 0,
        "1": 1,
        "2": 2,
        "3": 3,
        "4": 4,
        "5": 5,
        "6": 6,
      }

      for (const [key, value] of Object.entries(row.workHours)) {
        const dayIndex = dayMap[key.toLowerCase()]
        if (dayIndex !== undefined && value) {
          workingHours[dayIndex as 0 | 1 | 2 | 3 | 4 | 5 | 6] = value
        }
      }
    }

    const props: SalonProps = {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      slug: row.slug,
      address: row.address,
      phone: row.phone,
      whatsapp: row.whatsapp,
      description: row.description,
      workingHours,
      settings: row.settings,
      subscriptionStatus: row.subscriptionStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Salon.fromPersistence(props)
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Salon): SalonRow {
    const props = entity.toPersistence()

    // Converte WeeklyWorkingHours para formato do banco
    const workHours: Record<string, { start: string; end: string }> = {}
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

    if (props.workingHours) {
      for (const [dayIndex, hours] of Object.entries(props.workingHours)) {
        if (hours) {
          const dayName = dayNames[parseInt(dayIndex)]
          if (dayName) {
            workHours[dayName] = hours
          }
        }
      }
    }

    return {
      id: props.id,
      ownerId: props.ownerId,
      name: props.name,
      slug: props.slug,
      address: props.address,
      phone: props.phone,
      whatsapp: props.whatsapp,
      description: props.description,
      workHours: Object.keys(workHours).length > 0 ? workHours : null,
      settings: props.settings,
      subscriptionStatus: props.subscriptionStatus,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: SalonRow[]): Salon[] {
    return rows.map((row) => this.toDomain(row))
  }
}
