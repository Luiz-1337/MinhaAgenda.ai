/**
 * Repository para serviços (INFRASTRUCTURE LAYER)
 */

import { db, services, professionalServices, professionals, profiles, salons, appointments, and, asc, eq, inArray } from "@repo/db"
import type { ServiceRow } from "@/lib/types/service"

import type { PriceType } from "@/lib/types/service"

export interface ServicePayload {
  name: string
  description: string | null
  duration: number
  durationMax: number | null
  price: string
  priceType: PriceType
  priceMin: string | null
  priceMax: string | null
  priceOnRequest: boolean
  allowedWeekdays: number[] | null
  allowedStartTimes: string[] | null
  isActive: boolean
  averageCycleDays: number | null
}

export class ServiceRepository {
  /**
   * Busca todos os serviços de um salão
   */
  static async findBySalonId(salonId: string): Promise<ServiceRow[]> {
    const rows = await db.query.services.findMany({
      // Exclui placeholders internos (ex.: "Bloqueio de Horário" da sync do Google).
      where: and(eq(services.salonId, salonId), eq(services.isSystem, false)),
      columns: {
        id: true,
        salonId: true,
        name: true,
        description: true,
        duration: true,
        durationMax: true,
        price: true,
        priceType: true,
        priceMin: true,
        priceMax: true,
        priceOnRequest: true,
        allowedWeekdays: true,
        allowedStartTimes: true,
        isActive: true,
        averageCycleDays: true,
      },
      orderBy: asc(services.name),
    })

    const mappedRows: ServiceRow[] = rows.map((row) => ({
      id: row.id,
      salon_id: row.salonId,
      name: row.name,
      description: row.description ?? null,
      duration: row.duration,
      duration_max: row.durationMax ?? null,
      price: row.price ?? "0",
      price_type: (row.priceType ?? "fixed") as PriceType,
      price_min: row.priceMin ?? null,
      price_max: row.priceMax ?? null,
      price_on_request: row.priceOnRequest ?? false,
      allowed_weekdays: Array.isArray(row.allowedWeekdays) ? (row.allowedWeekdays as number[]) : null,
      allowed_start_times: Array.isArray(row.allowedStartTimes) ? (row.allowedStartTimes as string[]) : null,
      is_active: row.isActive,
      average_cycle_days: row.averageCycleDays ?? null,
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
        durationMax: true,
        price: true,
        priceType: true,
        priceMin: true,
        priceMax: true,
        priceOnRequest: true,
        allowedWeekdays: true,
        allowedStartTimes: true,
        isActive: true,
        averageCycleDays: true,
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
      duration_max: service.durationMax ?? null,
      price: service.price ?? "0",
      price_type: (service.priceType ?? "fixed") as PriceType,
      price_min: service.priceMin ?? null,
      price_max: service.priceMax ?? null,
      price_on_request: service.priceOnRequest ?? false,
      allowed_weekdays: Array.isArray(service.allowedWeekdays) ? (service.allowedWeekdays as number[]) : null,
      allowed_start_times: Array.isArray(service.allowedStartTimes) ? (service.allowedStartTimes as string[]) : null,
      is_active: service.isActive,
      average_cycle_days: service.averageCycleDays ?? null,
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
   * Conta os agendamentos vinculados a um serviço (escopo do salão).
   */
  static async countAppointments(serviceId: string, salonId: string): Promise<number> {
    const rows = await db.query.appointments.findMany({
      where: and(eq(appointments.serviceId, serviceId), eq(appointments.salonId, salonId)),
      columns: { id: true },
    })
    return rows.length
  }

  /**
   * Remove o serviço E seus agendamentos atomicamente. Necessário porque a FK
   * appointments→services é RESTRICT (NO ACTION); as demais dependências
   * (professional_services, waiting_list) caem por CASCADE ao apagar o serviço.
   */
  static async deleteWithAppointments(serviceId: string, salonId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(appointments)
        .where(and(eq(appointments.serviceId, serviceId), eq(appointments.salonId, salonId)))
      await tx
        .delete(services)
        .where(and(eq(services.id, serviceId), eq(services.salonId, salonId)))
    })
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
    professionalIds: string[],
    specialistIds: string[] = []
  ): Promise<void> {
    if (professionalIds.length === 0) {
      return
    }

    const specialistSet = new Set(specialistIds)
    await db.insert(professionalServices).values(
      professionalIds.map((professionalId) => ({
        professionalId,
        serviceId,
        isSpecialist: specialistSet.has(professionalId),
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
   * Busca os profissionais vinculados a um serviço com a flag de especialista.
   */
  static async findLinkedProfessionals(
    serviceId: string
  ): Promise<{ professionalId: string; isSpecialist: boolean }[]> {
    const links = await db.query.professionalServices.findMany({
      where: eq(professionalServices.serviceId, serviceId),
      columns: { professionalId: true, isSpecialist: true },
    })

    return links.map((link) => ({
      professionalId: link.professionalId,
      isSpecialist: link.isSpecialist,
    }))
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
