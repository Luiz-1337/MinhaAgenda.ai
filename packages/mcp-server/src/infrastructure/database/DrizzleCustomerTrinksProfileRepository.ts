import { randomUUID } from "node:crypto"
import { db, customerTrinksProfile, eq, and, lte, sql } from "@repo/db"
import { ICustomerTrinksProfileRepository } from "../../domain/repositories"
import {
  CustomerTrinksProfile,
  RecentServiceSnapshot,
} from "../../domain/entities/CustomerTrinksProfile"

type Row = typeof customerTrinksProfile.$inferSelect

function rowToDomain(row: Row): CustomerTrinksProfile {
  return CustomerTrinksProfile.fromPersistence({
    id: row.id,
    customerId: row.customerId,
    salonId: row.salonId,
    trinksClientId: row.trinksClientId,
    totalSpent: parseFloat(row.totalSpent as unknown as string),
    averageTicket: parseFloat(row.averageTicket as unknown as string),
    visitCount90Days: row.visitCount90Days,
    visitCount365Days: row.visitCount365Days,
    lastVisitAt: row.lastVisitAt,
    firstVisitAt: row.firstVisitAt,
    tags: (row.tags as string[] | null) ?? [],
    recentServices: (row.recentServices as RecentServiceSnapshot[] | null) ?? [],
    vipScore: row.vipScore,
    trinksNotFound: row.trinksNotFound,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export class DrizzleCustomerTrinksProfileRepository
  implements ICustomerTrinksProfileRepository
{
  async findByCustomerId(customerId: string): Promise<CustomerTrinksProfile | null> {
    const row = await db.query.customerTrinksProfile.findFirst({
      where: eq(customerTrinksProfile.customerId, customerId),
    })
    return row ? rowToDomain(row) : null
  }

  async findStaleForSalon(
    salonId: string,
    olderThan: Date,
    limit: number
  ): Promise<CustomerTrinksProfile[]> {
    const rows = await db.query.customerTrinksProfile.findMany({
      where: and(
        eq(customerTrinksProfile.salonId, salonId),
        lte(customerTrinksProfile.syncedAt, olderThan)
      ),
      orderBy: (table, { asc }) => [asc(table.syncedAt)],
      limit,
    })
    return rows.map(rowToDomain)
  }

  async countAndLastSyncForSalon(
    salonId: string
  ): Promise<{ count: number; lastSyncedAt: Date | null }> {
    const result = await db
      .select({
        count: sql<number>`count(*)::int`,
        lastSyncedAt: sql<Date | null>`max(${customerTrinksProfile.syncedAt})`,
      })
      .from(customerTrinksProfile)
      .where(eq(customerTrinksProfile.salonId, salonId))

    const row = result[0]
    return {
      count: Number(row?.count ?? 0),
      lastSyncedAt: row?.lastSyncedAt ?? null,
    }
  }

  async upsert(profile: CustomerTrinksProfile): Promise<void> {
    const data = profile.toPersistence()

    await db
      .insert(customerTrinksProfile)
      .values({
        id: data.id,
        customerId: data.customerId,
        salonId: data.salonId,
        trinksClientId: data.trinksClientId ?? null,
        totalSpent: data.totalSpent.toFixed(2),
        averageTicket: data.averageTicket.toFixed(2),
        visitCount90Days: data.visitCount90Days,
        visitCount365Days: data.visitCount365Days,
        lastVisitAt: data.lastVisitAt ?? null,
        firstVisitAt: data.firstVisitAt ?? null,
        tags: data.tags,
        recentServices: data.recentServices,
        vipScore: data.vipScore,
        trinksNotFound: data.trinksNotFound,
        syncedAt: data.syncedAt,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      })
      .onConflictDoUpdate({
        target: customerTrinksProfile.customerId,
        set: {
          trinksClientId: data.trinksClientId ?? null,
          totalSpent: data.totalSpent.toFixed(2),
          averageTicket: data.averageTicket.toFixed(2),
          visitCount90Days: data.visitCount90Days,
          visitCount365Days: data.visitCount365Days,
          lastVisitAt: data.lastVisitAt ?? null,
          firstVisitAt: data.firstVisitAt ?? null,
          tags: data.tags,
          recentServices: data.recentServices,
          vipScore: data.vipScore,
          trinksNotFound: data.trinksNotFound,
          syncedAt: data.syncedAt,
          updatedAt: new Date(),
        },
      })
  }

  async markNotFound(input: { customerId: string; salonId: string }): Promise<void> {
    const now = new Date()
    await db
      .insert(customerTrinksProfile)
      .values({
        id: randomUUID(),
        customerId: input.customerId,
        salonId: input.salonId,
        trinksClientId: null,
        totalSpent: "0",
        averageTicket: "0",
        visitCount90Days: 0,
        visitCount365Days: 0,
        lastVisitAt: null,
        firstVisitAt: null,
        tags: [],
        recentServices: [],
        vipScore: 0,
        trinksNotFound: true,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: customerTrinksProfile.customerId,
        set: {
          trinksNotFound: true,
          syncedAt: now,
          updatedAt: now,
        },
      })
  }
}
