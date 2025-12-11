/**
 * Tools para gerenciamento de profissionais
 */

import { and, eq } from "drizzle-orm"
import { db, professionals, professionalServices, services } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { getProfessionalsSchema, type GetProfessionalsInput } from "../schemas/tools.schema.js"

/**
 * Lista profissionais do salão
 */
export async function getProfessionalsTool(
  server: Server,
  args: unknown
): Promise<{
  professionals: Array<{
    id: string
    name: string
    services: string[]
    isActive: boolean
  }>
  message: string
}> {
  const params = getProfessionalsSchema.parse(args)

  // Busca profissionais com seus serviços
  const professionalsWithServices = await db
    .select({
      id: professionals.id,
      name: professionals.name,
      isActive: professionals.isActive,
      serviceName: services.name,
    })
    .from(professionals)
    .leftJoin(professionalServices, eq(professionals.id, professionalServices.professionalId))
    .leftJoin(services, eq(professionalServices.serviceId, services.id))
    .where(
      and(
        eq(professionals.salonId, params.salonId),
        params.includeInactive ? undefined : eq(professionals.isActive, true)
      )
    )

  // Agrupa serviços por profissional
  const professionalsMap = new Map<
    string,
    { id: string; name: string; services: string[]; isActive: boolean }
  >()

  for (const row of professionalsWithServices) {
    if (!professionalsMap.has(row.id)) {
      professionalsMap.set(row.id, {
        id: row.id,
        name: row.name,
        services: [],
        isActive: row.isActive,
      })
    }

    const professional = professionalsMap.get(row.id)!
    if (row.serviceName) {
      professional.services.push(row.serviceName)
    }
  }

  const professionalsList = Array.from(professionalsMap.values())

  return {
    professionals: professionalsList,
    message: `Encontrados ${professionalsList.length} profissional(is)`,
  }
}

