/**
 * Tools para informações do salão
 */

import { eq } from "drizzle-orm"
import { db, salons } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { getSalonInfoSchema, type GetSalonInfoInput } from "../schemas/tools.schema.js"

/**
 * Retorna informações estáticas do salão
 * Se salonId não for fornecido, tenta obter do contexto (via server.metadata ou similar)
 */
export async function getSalonDetailsTool(
  server: Server,
  args: unknown
): Promise<{
  id: string
  name: string
  address: string | null
  phone: string | null
  description: string | null
  cancellationPolicy: string | undefined
  businessHours: Record<string, { start: string; end: string }> | null
  settings: Record<string, unknown>
  message: string
}> {
  const params = getSalonInfoSchema.parse(args)
  
  // Se salonId não foi fornecido, tenta obter do contexto
  let salonId = params.salonId
  if (!salonId) {
    // Tenta obter do contexto do servidor (se disponível)
    const contextSalonId = (server as any).context?.salonId
    if (contextSalonId) {
      salonId = contextSalonId
    } else {
      throw new Error("salonId é obrigatório. Forneça como parâmetro ou configure no contexto.")
    }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      name: true,
      address: true,
      phone: true,
      description: true,
      settings: true,
      workHours: true,
    },
  })

  if (!salon) {
    throw new Error(`Salão com ID ${salonId} não encontrado`)
  }

  const settings = (salon.settings as Record<string, unknown>) || {}
  const workHours = (salon.workHours as Record<string, { start: string; end: string }> | null) || null

  // Extrai cancellation_policy de settings se existir
  const cancellationPolicy = settings.cancellation_policy as string | undefined

  return {
    id: salon.id,
    name: salon.name,
    address: salon.address || null,
    phone: salon.phone || null,
    description: salon.description || null,
    cancellationPolicy,
    businessHours: workHours, // Horário de funcionamento: { "0": { start: "09:00", end: "18:00" }, ... }
    settings,
    message: "Informações do salão recuperadas com sucesso",
  }
}

