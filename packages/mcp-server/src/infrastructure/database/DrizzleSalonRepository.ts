import { db, salons, salonIntegrations, and, eq } from "@repo/db"
import { ISalonRepository } from "../../domain/repositories"
import { Salon, SalonIntegration } from "../../domain/entities"
import { SalonMapper } from "../mappers"
import { InMemoryCache } from "../cache"
import { withDbRetry } from "../../shared/utils/db-retry"

const CACHE_TTL = 10 * 60 * 1000 // 10 minutos

const AI_DEBUG = process.env.AI_DEBUG === "true"

// Mapeia status interno para status do schema
type SchemaSubscriptionStatus = "ACTIVE" | "PAID" | "PAST_DUE" | "CANCELED" | "TRIAL"

function mapSubscriptionStatus(status: string | undefined): SchemaSubscriptionStatus {
  switch (status?.toLowerCase()) {
    case "active":
      return "ACTIVE"
    case "trial":
      return "TRIAL"
    case "cancelled":
    case "canceled":
      return "CANCELED"
    case "past_due":
      return "PAST_DUE"
    default:
      return "TRIAL"
  }
}

/**
 * Implementação do repositório de salões usando Drizzle ORM
 */
export class DrizzleSalonRepository implements ISalonRepository {
  private salonCache = new InMemoryCache<Salon | null>(CACHE_TTL)
  private integrationCache = new InMemoryCache<boolean>(CACHE_TTL)

  async findById(id: string): Promise<Salon | null> {
    const cached = this.salonCache.get(id)
    if (cached !== undefined) return cached

    const row = await withDbRetry(
      () => db.query.salons.findFirst({ where: eq(salons.id, id) }),
      { operationName: "salons.findById", onRetry: this.logRetry }
    )

    if (!row) {
      this.salonCache.set(id, null)
      return null
    }

    const salon = SalonMapper.toDomain({
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      slug: row.slug,
      address: row.address,
      phone: row.phone,
      whatsapp: row.whatsapp,
      description: row.description,
      workHours: row.workHours as Record<string, { start: string; end: string }> | null,
      settings: row.settings as Record<string, unknown> | null,
      subscriptionStatus: row.subscriptionStatus ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })

    // Carrega integrações
    const integrations = await this.getIntegrations(id)
    for (const integration of integrations) {
      salon.setIntegration(integration)
    }

    this.salonCache.set(id, salon)
    return salon
  }

  async findBySlug(slug: string): Promise<Salon | null> {
    const row = await withDbRetry(
      () => db.query.salons.findFirst({ where: eq(salons.slug, slug) }),
      { operationName: "salons.findBySlug", onRetry: this.logRetry }
    )

    if (!row) return null

    return this.findById(row.id)
  }

  async findByOwner(ownerId: string): Promise<Salon | null> {
    const row = await withDbRetry(
      () => db.query.salons.findFirst({ where: eq(salons.ownerId, ownerId) }),
      { operationName: "salons.findByOwner", onRetry: this.logRetry }
    )

    if (!row) return null

    return this.findById(row.id)
  }

  async getIntegrations(salonId: string): Promise<SalonIntegration[]> {
    const rows = await withDbRetry(
      () =>
        db.query.salonIntegrations.findMany({
          where: eq(salonIntegrations.salonId, salonId),
        }),
      { operationName: "salonIntegrations.findMany", onRetry: this.logRetry }
    )

    return rows.map((row) => ({
      provider: row.provider as "google" | "trinks",
      isActive: row.isActive,
      email: row.email ?? undefined,
    }))
  }

  async hasIntegration(salonId: string, provider: "google" | "trinks"): Promise<boolean> {
    const cacheKey = `${salonId}:${provider}`
    const cached = this.integrationCache.get(cacheKey)
    if (cached !== undefined) return cached

    const row = await withDbRetry(
      () =>
        db.query.salonIntegrations.findFirst({
          where: and(
            eq(salonIntegrations.salonId, salonId),
            eq(salonIntegrations.provider, provider),
            eq(salonIntegrations.isActive, true)
          ),
        }),
      { operationName: "salonIntegrations.findFirst", onRetry: this.logRetry }
    )

    const result = !!row
    this.integrationCache.set(cacheKey, result)
    return result
  }

  private logRetry = (info: {
    attempt: number
    delayMs: number
    error: unknown
    operationName?: string
  }): void => {
    if (!AI_DEBUG) return
    const message = info.error instanceof Error ? info.error.message : String(info.error)
    // eslint-disable-next-line no-console
    console.warn(
      `[DrizzleSalonRepository] retrying ${info.operationName ?? "query"} (attempt ${info.attempt}, delay ${info.delayMs}ms): ${message}`
    )
  }

  async save(salon: Salon): Promise<void> {
    const data = SalonMapper.toPersistence(salon)
    const subscriptionStatus = mapSubscriptionStatus(data.subscriptionStatus)

    await db.insert(salons).values({
      ownerId: data.ownerId,
      name: data.name,
      slug: data.slug ?? data.name.toLowerCase().replace(/\s+/g, "-"),
      address: data.address ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      description: data.description ?? null,
      workHours: data.workHours,
      settings: data.settings,
      subscriptionStatus,
    })

    this.salonCache.invalidate(data.id)
  }

  async update(salon: Salon): Promise<void> {
    const data = SalonMapper.toPersistence(salon)
    const subscriptionStatus = mapSubscriptionStatus(data.subscriptionStatus)

    await db
      .update(salons)
      .set({
        name: data.name,
        ...(data.slug ? { slug: data.slug } : {}),
        address: data.address || undefined,
        phone: data.phone || undefined,
        whatsapp: data.whatsapp || undefined,
        description: data.description || undefined,
        workHours: data.workHours,
        settings: data.settings,
        subscriptionStatus,
      })
      .where(eq(salons.id, data.id))

    this.salonCache.invalidate(data.id)
  }
}
