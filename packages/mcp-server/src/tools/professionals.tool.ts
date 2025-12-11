/**
 * Tools para gerenciamento de profissionais
 */

import { and, eq } from "drizzle-orm"
import { db, professionals } from "@repo/db"
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
    email: string
    phone: string | null
    isActive: boolean
  }>
  message: string
}> {
  const params = getProfessionalsSchema.parse(args)

  const professionalsList = await db
    .select({
      id: professionals.id,
      name: professionals.name,
      email: professionals.email,
      phone: professionals.phone,
      isActive: professionals.isActive,
    })
    .from(professionals)
    .where(
      and(
        eq(professionals.salonId, params.salonId),
        params.includeInactive ? undefined : eq(professionals.isActive, true)
      )
    )

  return {
    professionals: professionalsList,
    message: `Encontrados ${professionalsList.length} profissional(is)`,
  }
}

