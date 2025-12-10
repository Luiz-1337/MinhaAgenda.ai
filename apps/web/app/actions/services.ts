"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, asc, eq, inArray } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, professionalServices, professionals, salons, services } from "@repo/db"
import { getOwnerSalonId, isSalonOwnerError } from "@/lib/services/salon.service"
import { formatZodError, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import { extractErrorMessage } from "@/lib/services/error.service"
import type { ServiceRow, UpsertServiceInput, ServicePayload } from "@/lib/types/service"
import type { ActionResult } from "@/lib/types/common"

const upsertServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive(),
  price: z.number().positive(),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string().uuid()).default([]),
})

export type { UpsertServiceInput }

type ServiceSelect = Pick<
  typeof services.$inferSelect,
  "id" | "salonId" | "name" | "description" | "duration" | "price" | "isActive"
>

/**
 * Obtém todos os serviços de um salão
 */
export async function getServices(salonId: string): Promise<ServiceRow[]> {
  if (!salonId) {
    throw new Error("salonId é obrigatório")
  }

  const rows: ServiceSelect[] = await db.query.services.findMany({
    where: eq(services.salonId, salonId),
    columns: {
      id: true,
      salonId: true,
      name: true,
      description: true,
      duration: true,
      price: true,
      isActive: true,
    },
    orderBy: asc(services.name),
  })

  return rows.map((row) => ({
    id: row.id,
    salon_id: row.salonId,
    name: row.name,
    description: row.description ?? null,
    duration: row.duration,
    price: row.price ?? "0",
    is_active: row.isActive,
  }))
}

/**
 * Prepara o payload do serviço para inserção/atualização
 */
function prepareServicePayload(data: z.infer<typeof upsertServiceSchema>): ServicePayload {
  return {
    name: normalizeString(data.name),
    description: emptyStringToNull(data.description),
    duration: data.duration,
    price: data.price.toFixed(2),
    isActive: data.isActive,
  }
}

/**
 * Cria ou atualiza um serviço
 */
export async function upsertService(input: UpsertServiceInput): Promise<ActionResult> {
  // Validação
  const parsed = upsertServiceSchema.safeParse(input)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  // Verifica autenticação e propriedade do salão
  const ownerResult = await getOwnerSalonId()
  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  try {
    const payload = prepareServicePayload(parsed.data)
    let serviceId = parsed.data.id

    // Atualiza serviço existente
    if (serviceId) {
      await db
        .update(services)
        .set(payload)
        .where(and(eq(services.id, serviceId), eq(services.salonId, ownerResult.salonId)))
    } else {
      // Cria novo serviço
      const inserted = await db
        .insert(services)
        .values({ ...payload, salonId: ownerResult.salonId })
        .returning({ id: services.id })

      serviceId = inserted[0]?.id
    }

    if (!serviceId) {
      return { error: "Não foi possível salvar o serviço" }
    }

    // Remove associações existentes com profissionais
    await db.delete(professionalServices).where(eq(professionalServices.serviceId, serviceId))

    // Cria novas associações com profissionais válidos
    if (parsed.data.professionalIds.length > 0) {
      const validProfessionals = await db.query.professionals.findMany({
        where: and(
          eq(professionals.salonId, ownerResult.salonId),
          inArray(professionals.id, parsed.data.professionalIds)
        ),
        columns: { id: true },
      })

      const professionalIds = validProfessionals.map((p) => p.id)

      if (professionalIds.length > 0) {
        await db.insert(professionalServices).values(
          professionalIds.map((professionalId) => ({
            professionalId,
            serviceId,
          }))
        )
      }
    }
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }

  revalidatePath("/dashboard/services")
  return { success: true }
}

/**
 * Remove um serviço (soft delete)
 */
export async function deleteService(id: string): Promise<ActionResult> {
  const ownerResult = await getOwnerSalonId()
  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  try {
    await db
      .update(services)
      .set({ isActive: false })
      .where(and(eq(services.id, id), eq(services.salonId, ownerResult.salonId)))
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }

  revalidatePath("/dashboard/services")
  return { success: true }
}

/**
 * Obtém os IDs dos profissionais associados a um serviço
 */
export async function getServiceLinkedProfessionals(
  serviceId: string
): Promise<string[] | { error: string }> {
  const ownerResult = await getOwnerSalonId()
  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  const links = await db.query.professionalServices.findMany({
    where: eq(professionalServices.serviceId, serviceId),
    columns: { professionalId: true },
  })

  return links.map((link) => link.professionalId)
}
