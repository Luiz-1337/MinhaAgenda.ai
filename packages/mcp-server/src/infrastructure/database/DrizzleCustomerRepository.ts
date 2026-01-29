import { db, customers, and, eq } from "@repo/db"
import { ICustomerRepository } from "../../domain/repositories"
import { Customer } from "../../domain/entities"
import { CustomerMapper } from "../mappers"
import { normalizePhone } from "../../shared/utils/phone.utils"

/**
 * Implementação do repositório de clientes usando Drizzle ORM
 */
export class DrizzleCustomerRepository implements ICustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const row = await db.query.customers.findFirst({
      where: eq(customers.id, id),
    })

    if (!row) return null

    return CustomerMapper.toDomain({
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
  }

  async findByPhone(phone: string, salonId: string): Promise<Customer | null> {
    const normalizedPhone = normalizePhone(phone)

    const row = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, salonId),
        eq(customers.phone, normalizedPhone)
      ),
    })

    if (!row) return null

    return CustomerMapper.toDomain({
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
  }

  async delete(id: string): Promise<void> {
    await db.delete(customers).where(eq(customers.id, id))
  }
}
