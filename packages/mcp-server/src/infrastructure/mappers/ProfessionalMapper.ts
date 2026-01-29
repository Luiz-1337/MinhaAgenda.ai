import { Professional, ProfessionalProps } from "../../domain/entities"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface ProfessionalRow {
  id: string
  salonId: string
  userId?: string | null
  name: string
  email?: string | null
  phone?: string | null
  role?: string
  isActive: boolean
  googleCalendarId?: string | null
  commissionRate?: number | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Tipo para linha com serviços (join)
 */
export interface ProfessionalWithServicesRow extends ProfessionalRow {
  serviceIds?: string[]
}

/**
 * Mapper para conversão entre formato do banco e entidade Professional
 */
export class ProfessionalMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: ProfessionalRow, serviceIds: string[] = []): Professional {
    const props: ProfessionalProps = {
      id: row.id,
      salonId: row.salonId,
      userId: row.userId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isActive: row.isActive,
      services: serviceIds,
      googleCalendarId: row.googleCalendarId,
      commissionRate: row.commissionRate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Professional.fromPersistence(props)
  }

  /**
   * Converte uma linha com serviços para entidade de domínio
   */
  static toDomainWithServices(row: ProfessionalWithServicesRow): Professional {
    return this.toDomain(row, row.serviceIds ?? [])
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Professional): ProfessionalRow {
    const props = entity.toPersistence()
    return {
      id: props.id,
      salonId: props.salonId,
      userId: props.userId,
      name: props.name,
      email: props.email,
      phone: props.phone,
      role: props.role,
      isActive: props.isActive,
      googleCalendarId: props.googleCalendarId,
      commissionRate: props.commissionRate,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: ProfessionalRow[], servicesMap: Map<string, string[]> = new Map()): Professional[] {
    return rows.map((row) => this.toDomain(row, servicesMap.get(row.id) ?? []))
  }
}
