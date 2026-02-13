/**
 * Factory para criação da tool de profissionais (APPLICATION LAYER)
 */

import { z } from "zod"
import { db, professionals, services, professionalServices, and, eq } from "@repo/db"
import type { ToolDefinition } from "./tool-definition"

export class ProfessionalsToolFactory {
  /**
   * Cria tool para buscar profissionais
   */
  static create(salonId: string): ToolDefinition {
    return {
      description: "Lista os profissionais do salão e os serviços que realizam.",
      inputSchema: z.object({}),
      execute: async () => {
        const pros = await db
          .select({
            id: professionals.id,
            name: professionals.name,
          })
          .from(professionals)
          .where(
            and(eq(professionals.salonId, salonId), eq(professionals.isActive, true))
          )

        const results = await Promise.all(
          pros.map(async (p) => {
            const pServices = await db
              .select({ name: services.name })
              .from(services)
              .innerJoin(
                professionalServices,
                eq(services.id, professionalServices.serviceId)
              )
              .where(eq(professionalServices.professionalId, p.id))

            return {
              name: p.name,
              services: pServices.map((s) => s.name),
            }
          })
        )

        return { professionals: results }
      },
    }
  }
}
