import { TimeSlot } from "../../domain/entities"

/**
 * Fonte externa de horários OCUPADOS, consultada antes de oferecer horários ao
 * cliente (hoje: a agenda oficial do salão, ex.: Belasis).
 *
 * Todo método recebe o `salonId`. O use case que consome isto é singleton e o
 * worker atende vários salões em paralelo — um adaptador que guardasse o salão
 * entre `isConfigured` e `getBusySlots` misturaria a agenda de um salão com a de
 * outro.
 */
export interface IExternalBusySource {
  isConfigured(salonId: string): Promise<boolean>
  getBusySlots(salonId: string, professionalId: string, start: Date, end: Date): Promise<TimeSlot[]>
}
