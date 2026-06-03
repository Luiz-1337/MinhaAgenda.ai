/**
 * Factory para criação da tool de agendamento (APPLICATION LAYER)
 */

import { z } from "zod"
import { db, professionals, professionalServices, and, eq, domainServices } from "@repo/db"
import { FuzzySearchService } from "../fuzzy-search.service"
import type { ToolDefinition } from "./tool-definition"

export class AppointmentToolFactory {
  /**
   * Cria tool para agendar horário
   */
  static create(salonId: string, clientId?: string): ToolDefinition {
    const paramsSchema = z.object({
      date: z.string().describe("Data do agendamento (ISO date string YYYY-MM-DD)."),
      time: z.string().describe("Horário do agendamento (HH:mm)."),
      serviceName: z.string().describe("Nome do serviço."),
      professionalName: z.string().optional().describe("Nome do profissional (opcional)."),
    })

    return {
      description: "Realiza o agendamento de um serviço.",
      inputSchema: paramsSchema,
      execute: async ({
        date,
        time,
        serviceName,
        professionalName,
      }: z.infer<typeof paramsSchema>) => {
        if (!clientId) {
          throw new Error(
            "Você precisa estar logado para realizar um agendamento. Por favor, faça login e tente novamente."
          )
        }

        const service = await FuzzySearchService.findServiceByName(salonId, serviceName)

        let professionalId: string
        if (professionalName) {
          const professional = await FuzzySearchService.findProfessionalByName(
            salonId,
            professionalName
          )
          professionalId = professional.id
        } else {
          const pros = await db
            .select({ id: professionals.id })
            .from(professionals)
            .innerJoin(
              professionalServices,
              eq(professionals.id, professionalServices.professionalId)
            )
            .where(
              and(
                eq(professionals.salonId, salonId),
                eq(professionalServices.serviceId, service.id),
                eq(professionals.isActive, true)
              )
            )
            .limit(1)

          if (pros.length === 0) {
            throw new Error("Não há profissionais disponíveis para este serviço.")
          }
          professionalId = pros[0].id
        }

        // Delega ao serviço centralizado: valida expediente e capacidade,
        // aplica advisory lock + checagem de conflito (inclusive cross-salão)
        // e dispara o sync externo (Google/Trinks) de forma fire-and-forget.
        const result = await domainServices.createAppointmentService({
          salonId,
          professionalId,
          clientId,
          serviceId: service.id,
          date: `${date}T${time}`,
        })

        if (!result.success) {
          throw new Error(result.error)
        }

        return {
          success: true,
          appointmentId: result.data.appointmentId,
          details: {
            service: service.name,
            date: date,
            time: time,
            price: service.price,
          },
        }
      },
    }
  }
}
