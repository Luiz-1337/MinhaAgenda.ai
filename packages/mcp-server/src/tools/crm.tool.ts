/**
 * Tools para gerenciamento de CRM e preferências de clientes
 */

import { and, eq } from "drizzle-orm"
import { db, salonCustomers, leads } from "@repo/db"
import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  saveCustomerPreferenceSchema,
  qualifyLeadSchema,
  type SaveCustomerPreferenceInput,
  type QualifyLeadInput,
} from "../schemas/tools.schema.js"

/**
 * Salva uma preferência do cliente no CRM
 */
export async function saveCustomerPreferenceTool(
  server: Server,
  args: unknown
): Promise<{ message: string }> {
  const params = saveCustomerPreferenceSchema.parse(args)

  // Busca ou cria registro do cliente no salão
  let customer = await db.query.salonCustomers.findFirst({
    where: and(
      eq(salonCustomers.salonId, params.salonId),
      eq(salonCustomers.profileId, params.customerId)
    ),
    columns: { id: true, preferences: true },
  })

  const currentPreferences = (customer?.preferences as Record<string, unknown>) || {}

  // Atualiza preferências
  const updatedPreferences = {
    ...currentPreferences,
    [params.key]: params.value,
  }

  if (customer) {
    // Atualiza existente
    await db
      .update(salonCustomers)
      .set({ preferences: updatedPreferences })
      .where(eq(salonCustomers.id, customer.id))
  } else {
    // Cria novo registro
    await db.insert(salonCustomers).values({
      salonId: params.salonId,
      profileId: params.customerId,
      preferences: updatedPreferences,
    })
  }

  return {
    message: `Preferência "${params.key}" salva com sucesso para o cliente`,
  }
}

/**
 * Qualifica um lead baseado no interesse
 */
export async function qualifyLeadTool(
  server: Server,
  args: unknown
): Promise<{ message: string }> {
  const params = qualifyLeadSchema.parse(args)

  // Busca lead existente
  let lead = await db.query.leads.findFirst({
    where: and(
      eq(leads.salonId, params.salonId),
      eq(leads.phoneNumber, params.phoneNumber)
    ),
    columns: { id: true },
  })

  const statusMap: Record<string, string> = {
    high: "recently_scheduled",
    medium: "new",
    low: "cold",
    none: "cold",
  }

  if (lead) {
    // Atualiza lead existente
    await db
      .update(leads)
      .set({
        status: statusMap[params.interest] as any,
        notes: params.notes || undefined,
        lastContactAt: new Date(),
      })
      .where(eq(leads.id, lead.id))
  } else {
    // Cria novo lead
    await db.insert(leads).values({
      salonId: params.salonId,
      phoneNumber: params.phoneNumber,
      status: statusMap[params.interest] as any,
      notes: params.notes || null,
      lastContactAt: new Date(),
    })
  }

  const interestMap: Record<string, string> = {
    high: "alto",
    medium: "médio",
    low: "baixo",
    none: "nenhum",
  }

  return {
    message: `Lead qualificado com interesse ${interestMap[params.interest]}`,
  }
}

