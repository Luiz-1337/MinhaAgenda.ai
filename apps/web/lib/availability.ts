import { domainServices } from "@repo/db"
import type { GetAvailableSlotsInput } from "@/lib/types/availability"

/**
 * Obtém os horários disponíveis para agendamento em uma data específica
 * Agora delega para o serviço compartilhado no pacote db
 */
export async function getAvailableSlots({
  date,
  salonId,
  serviceDuration,
  professionalId,
}: GetAvailableSlotsInput): Promise<string[]> {
  return domainServices.getAvailableSlots({
    date,
    salonId,
    serviceDuration,
    professionalId,
  })
}
