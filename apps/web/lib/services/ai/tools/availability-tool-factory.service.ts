/**
 * Factory para criação da tool de disponibilidade (APPLICATION LAYER)
 */

import { tool } from "ai"
import { z } from "zod"
import { FuzzySearchService } from "../fuzzy-search.service"

export class AvailabilityToolFactory {
  /**
   * Cria tool para verificar disponibilidade de horários
   */
  static create(
    salonId: string,
    getAvailableSlotsFn: (params: {
      date: string
      salonId: string
      serviceDuration: number
      professionalId: string
    }) => Promise<string[]>
  ) {
    const paramsSchema = z.object({
      date: z.string().describe("Data (ISO) do dia solicitado."),
      serviceName: z.string().describe("Nome do serviço desejado."),
      professionalName: z.string().describe("Nome do profissional."),
    })

    return tool({
      description:
        "Verifica horários disponíveis para um serviço em uma data específica com um profissional específico.",
      inputSchema: paramsSchema,
      execute: async ({
        date,
        serviceName,
        professionalName,
      }: z.infer<typeof paramsSchema>) => {
        const service = await FuzzySearchService.findServiceByName(salonId, serviceName)
        const professional = await FuzzySearchService.findProfessionalByName(
          salonId,
          professionalName
        )

        const slots = await getAvailableSlotsFn({
          date,
          salonId,
          serviceDuration: service.duration,
          professionalId: professional.id,
        })

        return {
          slots,
          service: service.name,
          duration: service.duration,
          professional: professionalName,
        }
      },
    })
  }
}
