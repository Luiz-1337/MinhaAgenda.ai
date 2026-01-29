import { TimeSlot } from "../../../domain/entities"

/**
 * Tipo de slot ocupado do Trinks
 */
export interface TrinksBusySlot {
  start: string
  end: string
  professionalId?: string
}

/**
 * Tipo de agendamento do Trinks
 */
export interface TrinksBooking {
  id: string
  professionalId: string
  customerId: string
  serviceId: string
  start: string
  end: string
  status: string
}

/**
 * Mapper para conversão entre formato do Trinks e domínio
 */
export class TrinksMapper {
  /**
   * Converte slot ocupado do Trinks para TimeSlot
   */
  static fromTrinksBusySlot(slot: TrinksBusySlot): TimeSlot {
    return new TimeSlot({
      start: new Date(slot.start),
      end: new Date(slot.end),
      available: false,
      professionalId: slot.professionalId,
    })
  }

  /**
   * Converte lista de slots ocupados do Trinks
   */
  static fromTrinksBusySlotList(slots: TrinksBusySlot[]): TimeSlot[] {
    return slots.map((slot) => this.fromTrinksBusySlot(slot))
  }

  /**
   * Converte dados para formato de criação de agendamento no Trinks
   */
  static toTrinksBooking(data: {
    professionalId: string
    customerId: string
    serviceId: string
    startsAt: Date
    endsAt: Date
    notes?: string
  }): Omit<TrinksBooking, "id" | "status"> {
    return {
      professionalId: data.professionalId,
      customerId: data.customerId,
      serviceId: data.serviceId,
      start: data.startsAt.toISOString(),
      end: data.endsAt.toISOString(),
    }
  }
}
