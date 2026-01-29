import {
  IExternalScheduler,
  CreateBookingData,
  UpdateBookingData,
} from "../../../application/ports"
import { TimeSlot } from "../../../domain/entities"
import { TrinksMapper } from "./TrinksMapper"

// Importa funções do Trinks do @repo/db se disponíveis
let getTrinksBusySlots: ((professionalId: string, start: Date, end: Date) => Promise<{ start: string; end: string }[]>) | undefined
let createTrinksAppointment: ((data: unknown) => Promise<string>) | undefined
let updateTrinksAppointment: ((id: string, data: unknown) => Promise<void>) | undefined
let deleteTrinksAppointment: ((id: string) => Promise<void>) | undefined

// Tenta importar dinamicamente
try {
  const trinksModule = require("@repo/db")
  getTrinksBusySlots = trinksModule.getTrinksBusySlots
  createTrinksAppointment = trinksModule.createTrinksAppointment
  updateTrinksAppointment = trinksModule.updateTrinksAppointment
  deleteTrinksAppointment = trinksModule.deleteTrinksAppointment
} catch {
  // Módulo Trinks não disponível
}

/**
 * Implementação do IExternalScheduler para o sistema Trinks
 */
export class TrinksSchedulerService implements IExternalScheduler {
  async checkAvailability(professionalId: string, date: Date): Promise<TimeSlot[]> {
    // Retorna slots vazios - a lógica real está em getBusySlots
    return []
  }

  async getBusySlots(
    professionalId: string,
    start: Date,
    end: Date
  ): Promise<TimeSlot[]> {
    if (!getTrinksBusySlots) {
      console.warn("Trinks integration not available")
      return []
    }

    try {
      const busySlots = await getTrinksBusySlots(professionalId, start, end)
      return TrinksMapper.fromTrinksBusySlotList(
        busySlots.map((slot) => ({
          ...slot,
          professionalId,
        }))
      )
    } catch (error) {
      console.error("Erro ao buscar slots do Trinks:", error)
      return []
    }
  }

  async createBooking(data: CreateBookingData): Promise<string> {
    if (!createTrinksAppointment) {
      throw new Error("Trinks integration not available")
    }

    const trinksData = TrinksMapper.toTrinksBooking({
      professionalId: data.professionalId,
      customerId: data.customerId,
      serviceId: data.serviceId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      notes: data.notes,
    })

    return createTrinksAppointment(trinksData)
  }

  async updateBooking(bookingId: string, data: UpdateBookingData): Promise<void> {
    if (!updateTrinksAppointment) {
      throw new Error("Trinks integration not available")
    }

    await updateTrinksAppointment(bookingId, data)
  }

  async cancelBooking(bookingId: string): Promise<void> {
    if (!deleteTrinksAppointment) {
      throw new Error("Trinks integration not available")
    }

    await deleteTrinksAppointment(bookingId)
  }

  async isConfigured(salonId: string): Promise<boolean> {
    try {
      const { db, salonIntegrations, and, eq } = await import("@repo/db")

      const integration = await db.query.salonIntegrations.findFirst({
        where: and(
          eq(salonIntegrations.salonId, salonId),
          eq(salonIntegrations.provider, "trinks"),
          eq(salonIntegrations.isActive, true)
        ),
      })

      return !!integration
    } catch {
      return false
    }
  }
}
