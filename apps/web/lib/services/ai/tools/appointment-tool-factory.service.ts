/**
 * Factory para criação da tool de agendamento (APPLICATION LAYER)
 */

import { tool } from "ai"
import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { db, appointments, professionals, professionalServices } from "@repo/db"
import { FuzzySearchService } from "../fuzzy-search.service"

export class AppointmentToolFactory {
  /**
   * Cria tool para agendar horário
   */
  static create(salonId: string, clientId?: string) {
    const paramsSchema = z.object({
      date: z.string().describe("Data do agendamento (ISO date string YYYY-MM-DD)."),
      time: z.string().describe("Horário do agendamento (HH:mm)."),
      serviceName: z.string().describe("Nome do serviço."),
      professionalName: z.string().optional().describe("Nome do profissional (opcional)."),
    })

    return tool({
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

        const appointmentDate = new Date(`${date}T${time}`)
        if (isNaN(appointmentDate.getTime())) {
          throw new Error("Data ou hora inválida.")
        }

        const endTime = new Date(appointmentDate.getTime() + service.duration * 60 * 1000)

        const [appointment] = await db
          .insert(appointments)
          .values({
            salonId,
            clientId,
            professionalId,
            serviceId: service.id,
            date: appointmentDate,
            endTime: endTime,
            status: "pending",
          })
          .returning({ id: appointments.id })

        // Sincroniza com Google Calendar (não bloqueia se falhar)
        try {
          const { createGoogleEvent } = await import("@/lib/google")
          await createGoogleEvent(appointment.id)
        } catch {
          // Silenciosamente falha - nosso banco é a fonte da verdade
        }

        // Sincroniza com Trinks (não bloqueia se falhar)
        try {
          const { createTrinksAppointment } = await import("@repo/db")
          await createTrinksAppointment(appointment.id, salonId)
        } catch {
          // Silenciosamente falha - nosso banco é a fonte da verdade
        }

        return {
          success: true,
          appointmentId: appointment.id,
          details: {
            service: service.name,
            date: date,
            time: time,
            price: service.price,
          },
        }
      },
    })
  }
}
