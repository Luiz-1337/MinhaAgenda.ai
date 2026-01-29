import { db, leads, and, eq } from "@repo/db"
import { ILeadRepository, Lead } from "../../domain/repositories"
import { normalizePhone } from "../../shared/utils/phone.utils"

// Mapeia status interno para status do schema
type SchemaLeadStatus = "new" | "cold" | "recently_scheduled"

function mapLeadStatus(status: Lead["status"]): SchemaLeadStatus {
  switch (status) {
    case "contacted":
      return "new" // Mapeia contacted para new
    case "new":
    case "cold":
    case "recently_scheduled":
      return status
    default:
      return "new"
  }
}

/**
 * Implementação do repositório de leads usando Drizzle ORM
 */
export class DrizzleLeadRepository implements ILeadRepository {
  async findByPhone(phoneNumber: string, salonId: string): Promise<Lead | null> {
    const normalizedPhone = normalizePhone(phoneNumber)

    const row = await db.query.leads.findFirst({
      where: and(
        eq(leads.salonId, salonId),
        eq(leads.phoneNumber, normalizedPhone)
      ),
    })

    if (!row) return null

    return {
      id: row.id,
      salonId: row.salonId ?? salonId, // Fallback para salonId passado
      phoneNumber: row.phoneNumber,
      status: row.status as Lead["status"],
      notes: row.notes,
      lastContactAt: row.lastContactAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async findBySalon(salonId: string): Promise<Lead[]> {
    const rows = await db.query.leads.findMany({
      where: eq(leads.salonId, salonId),
      orderBy: (leads, { desc }) => [desc(leads.lastContactAt)],
    })

    return rows.map((row) => ({
      id: row.id,
      salonId: row.salonId ?? salonId,
      phoneNumber: row.phoneNumber,
      status: row.status as Lead["status"],
      notes: row.notes,
      lastContactAt: row.lastContactAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async upsert(lead: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead> {
    const normalizedPhone = normalizePhone(lead.phoneNumber)
    const schemaStatus = mapLeadStatus(lead.status)

    const existing = await this.findByPhone(normalizedPhone, lead.salonId)

    if (existing) {
      await db
        .update(leads)
        .set({
          status: schemaStatus,
          notes: lead.notes,
          lastContactAt: lead.lastContactAt ?? new Date(),
        })
        .where(eq(leads.id, existing.id))

      return {
        ...existing,
        status: lead.status,
        notes: lead.notes,
        lastContactAt: lead.lastContactAt ?? new Date(),
        updatedAt: new Date(),
      }
    }

    const [inserted] = await db
      .insert(leads)
      .values({
        salonId: lead.salonId,
        phoneNumber: normalizedPhone,
        status: schemaStatus,
        notes: lead.notes,
        lastContactAt: lead.lastContactAt ?? new Date(),
      })
      .returning()

    return {
      id: inserted.id,
      salonId: inserted.salonId ?? lead.salonId,
      phoneNumber: inserted.phoneNumber,
      status: inserted.status as Lead["status"],
      notes: inserted.notes,
      lastContactAt: inserted.lastContactAt,
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    }
  }

  async updateStatus(id: string, status: Lead["status"], notes?: string): Promise<void> {
    const schemaStatus = mapLeadStatus(status)

    await db
      .update(leads)
      .set({
        status: schemaStatus,
        notes: notes ?? undefined,
        lastContactAt: new Date(),
      })
      .where(eq(leads.id, id))
  }
}
