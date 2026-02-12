/**
 * Factory para criação da tool de serviços (APPLICATION LAYER)
 */

import { tool } from "ai"
import { z } from "zod"
import { db, services, and, eq } from "@repo/db"

export class ServicesToolFactory {
  /**
   * Cria tool para buscar serviços do salão
   */
  static create(salonId: string) {
    return tool({
      description: "Lista os serviços disponíveis no salão com seus preços.",
      inputSchema: z.object({}),
      execute: async () => {
        const results = await db
          .select({
            name: services.name,
            description: services.description,
            duration: services.duration,
            price: services.price,
          })
          .from(services)
          .where(and(eq(services.salonId, salonId), eq(services.isActive, true)))

        return { services: results }
      },
    })
  }
}
