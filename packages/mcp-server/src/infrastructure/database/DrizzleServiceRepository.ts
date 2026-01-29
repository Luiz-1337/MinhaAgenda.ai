import { db, services, and, eq } from "@repo/db"
import { IServiceRepository } from "../../domain/repositories"
import { Service } from "../../domain/entities"
import { ServiceMapper } from "../mappers"

/**
 * Implementação do repositório de serviços usando Drizzle ORM
 */
export class DrizzleServiceRepository implements IServiceRepository {
  async findById(id: string): Promise<Service | null> {
    const row = await db.query.services.findFirst({
      where: eq(services.id, id),
    })

    if (!row) return null

    return ServiceMapper.toDomain({
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      description: row.description,
      duration: row.duration,
      price: row.price,
      priceType: row.priceType ?? undefined,
      priceMin: row.priceMin,
      priceMax: row.priceMax,
      isActive: row.isActive,
      createdAt: row.createdAt,
    })
  }

  async findBySalon(salonId: string, includeInactive = false): Promise<Service[]> {
    const conditions = [eq(services.salonId, salonId)]
    if (!includeInactive) {
      conditions.push(eq(services.isActive, true))
    }

    const rows = await db.query.services.findMany({
      where: and(...conditions),
      orderBy: (services, { asc }) => [asc(services.name)],
    })

    return rows.map((row) =>
      ServiceMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        name: row.name,
        description: row.description,
        duration: row.duration,
        price: row.price,
        priceType: row.priceType ?? undefined,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        isActive: row.isActive,
        createdAt: row.createdAt,
      })
    )
  }

  async findActive(salonId: string): Promise<Service[]> {
    return this.findBySalon(salonId, false)
  }

  async save(service: Service): Promise<void> {
    const data = ServiceMapper.toPersistence(service)

    await db.insert(services).values({
      salonId: data.salonId,
      name: data.name,
      description: data.description,
      duration: data.duration,
      price: data.price.toString(),
      priceType: (data.priceType ?? "fixed") as "fixed" | "range",
      priceMin: data.priceMin?.toString() ?? null,
      priceMax: data.priceMax?.toString() ?? null,
      isActive: data.isActive,
    })
  }

  async update(service: Service): Promise<void> {
    const data = ServiceMapper.toPersistence(service)

    await db
      .update(services)
      .set({
        name: data.name,
        description: data.description,
        duration: data.duration,
        price: data.price.toString(),
        priceType: (data.priceType ?? "fixed") as "fixed" | "range",
        priceMin: data.priceMin?.toString() ?? null,
        priceMax: data.priceMax?.toString() ?? null,
        isActive: data.isActive,
      })
      .where(eq(services.id, data.id))
  }
}
