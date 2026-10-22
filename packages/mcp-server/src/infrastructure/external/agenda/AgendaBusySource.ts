import { domainServices } from "@repo/db"

import { IExternalBusySource } from "../../../application/ports"
import { TimeSlot } from "../../../domain/entities"

/**
 * Horários ocupados na agenda OFICIAL do salão (ex.: Belasis), para a IA não
 * oferecer o que a recepção já vendeu lá. Toda a lógica (qual provedor, de-para
 * do profissional, credencial) vive no @repo/db — aqui só se converte para
 * TimeSlot.
 *
 * Sem estado: o salão chega em cada chamada (ver IExternalBusySource).
 */
export class AgendaBusySource implements IExternalBusySource {
  async isConfigured(salonId: string): Promise<boolean> {
    return domainServices.hasActiveAgendaProvider(salonId)
  }

  async getBusySlots(
    salonId: string,
    professionalId: string,
    start: Date,
    end: Date
  ): Promise<TimeSlot[]> {
    const intervals = await domainServices.getAgendaBusyIntervals(salonId, professionalId, start, end)
    return intervals.map(
      (interval) =>
        new TimeSlot({ start: interval.start, end: interval.end, available: false, professionalId })
    )
  }
}
