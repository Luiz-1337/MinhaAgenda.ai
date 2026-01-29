import { Service, ServiceProps } from "../../domain/entities"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface ServiceRow {
  id: string
  salonId: string
  name: string
  description?: string | null
  duration: number
  price: string | number // Pode vir como string do Decimal
  priceType?: string
  priceMin?: string | number | null
  priceMax?: string | number | null
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Mapper para conversão entre formato do banco e entidade Service
 */
export class ServiceMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: ServiceRow): Service {
    const props: ServiceProps = {
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      description: row.description,
      duration: row.duration,
      price: typeof row.price === "string" ? parseFloat(row.price) : row.price,
      priceType: row.priceType,
      priceMin: row.priceMin ? (typeof row.priceMin === "string" ? parseFloat(row.priceMin) : row.priceMin) : null,
      priceMax: row.priceMax ? (typeof row.priceMax === "string" ? parseFloat(row.priceMax) : row.priceMax) : null,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Service.fromPersistence(props)
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Service): ServiceRow {
    const props = entity.toPersistence()
    return {
      id: props.id,
      salonId: props.salonId,
      name: props.name,
      description: props.description,
      duration: props.duration,
      price: props.price,
      priceType: props.priceType,
      priceMin: props.priceMin,
      priceMax: props.priceMax,
      isActive: props.isActive,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: ServiceRow[]): Service[] {
    return rows.map((row) => this.toDomain(row))
  }
}
