import { Product, ProductProps } from "../../domain/entities"

/**
 * Tipo representando uma linha do banco de dados
 */
export interface ProductRow {
  id: string
  salonId: string
  name: string
  description?: string | null
  price: string | number // Pode vir como string do Decimal
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

/**
 * Mapper para conversão entre formato do banco e entidade Product
 */
export class ProductMapper {
  /**
   * Converte uma linha do banco para entidade de domínio
   */
  static toDomain(row: ProductRow): Product {
    const props: ProductProps = {
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      description: row.description,
      price: typeof row.price === "string" ? parseFloat(row.price) : row.price,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
    return Product.fromPersistence(props)
  }

  /**
   * Converte uma entidade para formato de persistência
   */
  static toPersistence(entity: Product): ProductRow {
    const props = entity.toPersistence()
    return {
      id: props.id,
      salonId: props.salonId,
      name: props.name,
      description: props.description,
      price: props.price,
      isActive: props.isActive,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    }
  }

  /**
   * Converte múltiplas linhas para entidades
   */
  static toDomainList(rows: ProductRow[]): Product[] {
    return rows.map((row) => this.toDomain(row))
  }
}
