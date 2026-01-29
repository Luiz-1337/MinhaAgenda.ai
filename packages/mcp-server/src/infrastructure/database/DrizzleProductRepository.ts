import { db, products, and, eq } from "@repo/db"
import { IProductRepository } from "../../domain/repositories"
import { Product } from "../../domain/entities"
import { ProductMapper } from "../mappers"

/**
 * Implementação do repositório de produtos usando Drizzle ORM
 */
export class DrizzleProductRepository implements IProductRepository {
  async findById(id: string): Promise<Product | null> {
    const row = await db.query.products.findFirst({
      where: eq(products.id, id),
    })

    if (!row) return null

    return ProductMapper.toDomain({
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      description: row.description,
      price: row.price,
      isActive: row.isActive,
      createdAt: row.createdAt,
    })
  }

  async findBySalon(salonId: string, includeInactive = false): Promise<Product[]> {
    const conditions = [eq(products.salonId, salonId)]
    if (!includeInactive) {
      conditions.push(eq(products.isActive, true))
    }

    const rows = await db.query.products.findMany({
      where: and(...conditions),
      orderBy: (products, { asc }) => [asc(products.name)],
    })

    return rows.map((row) =>
      ProductMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        name: row.name,
        description: row.description,
        price: row.price,
        isActive: row.isActive,
        createdAt: row.createdAt,
      })
    )
  }

  async findActive(salonId: string): Promise<Product[]> {
    return this.findBySalon(salonId, false)
  }

  async save(product: Product): Promise<void> {
    const data = ProductMapper.toPersistence(product)

    await db.insert(products).values({
      salonId: data.salonId,
      name: data.name,
      description: data.description,
      price: data.price.toString(),
      isActive: data.isActive,
    })
  }

  async update(product: Product): Promise<void> {
    const data = ProductMapper.toPersistence(product)

    await db
      .update(products)
      .set({
        name: data.name,
        description: data.description,
        price: data.price.toString(),
        isActive: data.isActive,
      })
      .where(eq(products.id, data.id))
  }
}
