import { db, customers, and, eq } from "@repo/db"
import { ICustomerRepository } from "../../domain/repositories"
import { Customer } from "../../domain/entities"
import { CustomerMapper } from "../mappers"
import { normalizePhone } from "../../shared/utils/phone.utils"
import { InMemoryCache } from "../cache"

const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Implementação do repositório de clientes usando Drizzle ORM
 */
export class DrizzleCustomerRepository implements ICustomerRepository {
  private idCache = new InMemoryCache<Customer | null>(CACHE_TTL)
  private phoneCache = new InMemoryCache<Customer | null>(CACHE_TTL)

  async findById(id: string): Promise<Customer | null> {
    const cached = this.idCache.get(id)
    if (cached !== undefined) return cached

    const row = await db.query.customers.findFirst({
      where: eq(customers.id, id),
    })

    if (!row) {
      this.idCache.set(id, null)
      return null
    }

    const customer = CustomerMapper.toDomain({
      id: row.id,
      salonId: row.salonId,
      phone: row.phone,
      name: row.name,
      email: row.email,
      preferences: row.preferences as Record<string, unknown> | null,
      aiPreferences: row.aiPreferences,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })

    this.idCache.set(id, customer)
    return customer
  }

  async findByPhone(phone: string, salonId: string): Promise<Customer | null> {
    const normalizedPhone = normalizePhone(phone)
    const cacheKey = `${salonId}:${normalizedPhone}`
    const cached = this.phoneCache.get(cacheKey)
    if (cached !== undefined) return cached

    const row = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.phone, normalizedPhone)
      ),
    })

    if (!row) {
      this.phoneCache.set(cacheKey, null)
      return null
    }

    const customer = CustomerMapper.toDomain({
      id: row.id,
      salonId: row.salonId,
      phone: row.phone,
      name: row.name,
      email: row.email,
      preferences: row.preferences as Record<string, unknown> | null,
      aiPreferences: row.aiPreferences,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })

    this.phoneCache.set(cacheKey, customer)
    this.idCache.set(customer.id, customer)
    return customer
  }

  async findBySalon(salonId: string): Promise<Customer[]> {
    const rows = await db.query.customers.findMany({
      where: eq(customers.salonId, salonId),
      orderBy: (customers, { asc }) => [asc(customers.name)],
    })

    return rows.map((row) =>
      CustomerMapper.toDomain({
        id: row.id,
        salonId: row.salonId,
        phone: row.phone,
        name: row.name,
        email: row.email,
        preferences: row.preferences as Record<string, unknown> | null,
        aiPreferences: row.aiPreferences,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
    )
  }

  async save(customer: Customer): Promise<void> {
    const data = CustomerMapper.toPersistence(customer)

    await db.insert(customers).values({
      id: data.id,
      salonId: data.salonId,
      phone: data.phone,
      name: data.name,
      email: data.email,
      preferences: data.preferences,
      aiPreferences: data.aiPreferences,
    })

    this.idCache.invalidate(data.id)
    this.phoneCache.clear()
  }

  async update(customer: Customer): Promise<void> {
    const data = CustomerMapper.toPersistence(customer)

    await db
      .update(customers)
      .set({
        name: data.name,
        email: data.email,
        preferences: data.preferences,
        aiPreferences: data.aiPreferences,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, data.id))

    this.idCache.invalidate(data.id)
    this.phoneCache.clear()
  }

  async delete(id: string): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id))
    this.idCache.invalidate(id)
    this.phoneCache.clear()
  }
}
