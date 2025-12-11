/**
 * Tools para gerenciamento de serviços
 */

import { and, eq } from "drizzle-orm"
import { db, services } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { getServicesSchema, type GetServicesInput } from "../schemas/tools.schema.js"

/**
 * Busca serviços disponíveis de um salão
 */
export async function getServicesTool(
  server: Server,
  args: unknown
): Promise<{
  services: Array<{
    id: string
    name: string
    description: string | null
    duration: number
    price: string
    isActive: boolean
  }>
  message: string
}> {
  const params = getServicesSchema.parse(args)

  const servicesList = await db
    .select({
      id: services.id,
      name: services.name,
      description: services.description,
      duration: services.duration,
      price: services.price,
      isActive: services.isActive,
    })
    .from(services)
    .where(
      and(
        eq(services.salonId, params.salonId),
        params.includeInactive ? undefined : eq(services.isActive, true)
      )
    )

  return {
    services: servicesList.map((s) => ({
      ...s,
      price: s.price.toString(),
    })),
    message: `Encontrados ${servicesList.length} serviço(s) disponível(is)`,
  }
}

