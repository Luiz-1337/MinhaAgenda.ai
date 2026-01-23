/**
 * Repository para serviços (INFRASTRUCTURE LAYER)
 */

import { and, asc, eq, inArray } from "drizzle-orm"
import { db, services, professionalServices, professionals, profiles, salons } from "@repo/db"
import type { ServiceRow } from "@/lib/types/service"

import type { PriceType } from "@/lib/types/service"

export interface ServicePayload {
  name: string
  description: string | null
  duration: number
  price: string
  priceType: PriceType
  priceMin: string | null
  priceMax: string | null
  isActive: boolean
}

export class ServiceRepository {
  /**
   * Busca todos os serviços de um salão
   */
  static async findBySalonId(salonId: string): Promise<ServiceRow[]> {
    const rows = await db.query.services.findMany({
      where: eq(services.salonId, salonId),
      columns: {
        id: true,
        salonId: true,
        name: true,
        description: true,
        duration: true,
        price: true,
        priceType: true,
        priceMin: true,
        priceMax: true,
        isActive: true,
      },
      orderBy: asc(services.name),
    })

    const mappedRows: ServiceRow[] = rows.map((row) => ({
      id: row.id,
      salon_id: row.salonId,
      name: row.name,
      description: row.description ?? null,
      duration: row.duration,
      price: row.price ?? "0",
      price_type: (row.priceType ?? "fixed") as PriceType,
      price_min: row.priceMin ?? null,
      price_max: row.priceMax ?? null,
      is_active: row.isActive,
    }))
    
    return mappedRows
  }

  /**
   * Busca um serviço por ID
   */
  static async findById(id: string, salonId: string): Promise<ServiceRow | null> {
    const service = await db.query.services.findFirst({
      where: and(eq(services.id, id), eq(services.salonId, salonId)),
      columns: {
        id: true,
        salonId: true,
        name: true,
        description: true,
        duration: true,
        price: true,
        priceType: true,
        priceMin: true,
        priceMax: true,
        isActive: true,
      },
    })

    if (!service) {
      return null
    }

    return {
      id: service.id,
      salon_id: service.salonId,
      name: service.name,
      description: service.description ?? null,
      duration: service.duration,
      price: service.price ?? "0",
      price_type: (service.priceType ?? "fixed") as PriceType,
      price_min: service.priceMin ?? null,
      price_max: service.priceMax ?? null,
      is_active: service.isActive,
    }
  }

  /**
   * Cria um novo serviço
   */
  static async create(salonId: string, payload: ServicePayload): Promise<string> {
    const inserted = await db
      .insert(services)
      .values({ ...payload, salonId })
      .returning({ id: services.id })

    if (!inserted[0]?.id) {
      throw new Error("Não foi possível criar o serviço")
    }

    return inserted[0].id
  }

  /**
   * Atualiza um serviço existente
   */
  static async update(
    id: string,
    salonId: string,
    payload: ServicePayload
  ): Promise<void> {
    await db
      .update(services)
      .set(payload)
      .where(and(eq(services.id, id), eq(services.salonId, salonId)))
  }

  /**
   * Remove um serviço
   */
  static async delete(id: string, salonId: string): Promise<void> {
    await db
      .delete(services)
      .where(and(eq(services.id, id), eq(services.salonId, salonId)))
  }

  /**
   * Remove todas as associações de profissionais com um serviço
   */
  static async removeProfessionalAssociations(serviceId: string): Promise<void> {
    await db.delete(professionalServices).where(eq(professionalServices.serviceId, serviceId))
  }

  /**
   * Associa profissionais a um serviço
   */
  static async associateProfessionals(
    serviceId: string,
    professionalIds: string[]
  ): Promise<void> {
    if (professionalIds.length === 0) {
      return
    }

    await db.insert(professionalServices).values(
      professionalIds.map((professionalId) => ({
        professionalId,
        serviceId,
      }))
    )
  }

  /**
   * Busca IDs dos profissionais vinculados a um serviço
   */
  static async findLinkedProfessionalIds(serviceId: string): Promise<string[]> {
    const links = await db.query.professionalServices.findMany({
      where: eq(professionalServices.serviceId, serviceId),
      columns: { professionalId: true },
    })

    return links.map((link) => link.professionalId)
  }

  /**
   * Valida que profissionais pertencem ao salão
   */
  static async validateProfessionalsBelongToSalon(
    salonId: string,
    professionalIds: string[]
  ): Promise<string[]> {
    if (professionalIds.length === 0) {
      return []
    }

    const validProfessionals = await db.query.professionals.findMany({
      where: and(
        eq(professionals.salonId, salonId),
        inArray(professionals.id, professionalIds)
      ),
      columns: { id: true },
    })

    return validProfessionals.map((p) => p.id)
  }
}
