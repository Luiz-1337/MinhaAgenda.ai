import { db, services, and, eq } from "@repo/db"
import { IServiceRepository } from "../../domain/repositories"
import { Service } from "../../domain/entities"
import { ServiceMapper } from "../mappers"
import { InMemoryCache } from "../cache"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Implementação do repositório de serviços usando Drizzle ORM
 */
export class DrizzleServiceRepository implements IServiceRepository {
  private listCache = new InMemoryCache<Service[]>(CACHE_TTL)
  private idCache = new InMemoryCache<Service | null>(CACHE_TTL)

  async findById(id: string): Promise<Service | null> {
    const cached = this.idCache.get(id)
    if (cached !== undefined) return cached

    const row = await db.query.services.findFirst({
      where: eq(services.id, id),
    })

    if (!row) {
      this.idCache.set(id, null)
      return null
    }

    const service = ServiceMapper.toDomain({
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

    this.idCache.set(id, service)
    return service
  }

  async findBySalon(salonId: string, includeInactive = false): Promise<Service[]> {
    const cacheKey = `${salonId}:${includeInactive}`
    const cached = this.listCache.get(cacheKey)
    if (cached) return cached

    const conditions = [eq(services.salonId, salonId)]
    if (!includeInactive) {
      conditions.push(eq(services.isActive, true))
    }

    const rows = await db.query.services.findMany({
      where: and(...conditions),
      orderBy: (services, { asc }) => [asc(services.name)],
    })

    const result = rows.map((row) =>
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

    this.listCache.set(cacheKey, result)
    return result
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

    this.listCache.clear()
    this.idCache.clear()
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

    this.listCache.clear()
    this.idCache.clear()
  }
}
