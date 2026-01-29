import { Customer, CustomerProps } from "../../domain/entities"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface CustomerRow {
  id: string
  salonId: string
  phone: string
  name: string
  email?: string | null
  preferences?: Record<string, unknown> | null
  aiPreferences?: string | null
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Mapper para conversão entre formato do banco e entidade Customer
 */
export class CustomerMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: CustomerRow): Customer {
    const props: CustomerProps = {
      id: row.id,
      salonId: row.salonId,
      phone: row.phone,
      name: row.name,
      email: row.email,
      preferences: row.preferences,
      aiPreferences: row.aiPreferences,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Customer.fromPersistence(props)
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Customer): CustomerRow {
    const props = entity.toPersistence()
    return {
      id: props.id,
      salonId: props.salonId,
      phone: props.phone,
      name: props.name,
      email: props.email,
      preferences: props.preferences,
      aiPreferences: props.aiPreferences,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte uma entidade para formato de inserção
   */
  static toInsert(entity: Customer): Omit<CustomerRow, "id" | "createdAt" | "updatedAt"> {
    const row = this.toPersistence(entity)
    const { id, createdAt, updatedAt, ...insertData } = row
    return insertData
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: CustomerRow[]): Customer[] {
    return rows.map((row) => this.toDomain(row))
  }
}
