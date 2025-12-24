"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, asc, eq, inArray } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, professionalServices, professionals, salons, services } from "@repo/db"
import { formatZodError, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import { extractErrorMessage } from "@/lib/services/error.service"
import type { ServiceRow, UpsertServiceInput, ServicePayload } from "@/lib/types/service"
import type { ActionResult } from "@/lib/types/common"

import { hasSalonPermission } from "@/lib/services/permissions.service"

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
export async function getServices(salonId: string): Promise<ActionResult<ServiceRow[]>> {
  try {
    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    // Permission Check: Verify if user has access to the salon (Owner/Manager)
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
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

    const formattedRows = rows.map((row) => ({
      id: row.id,
      salon_id: row.salonId,
      name: row.name,
      description: row.description ?? null,
      duration: row.duration,
      price: row.price ?? "0",
      is_active: row.isActive,
    }))

    return { success: true, data: formattedRows }
  } catch (error) {
    console.error("Erro ao buscar serviços:", error)
    return { error: "Falha ao buscar serviços." }
  }
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
export async function upsertService(input: UpsertServiceInput & { salonId: string }): Promise<ActionResult> {
  try {
    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    // 2. Input Validation (Zod)
    const parsed = upsertServiceSchema.safeParse(input)
    if (!parsed.success) {
      return { error: formatZodError(parsed.error) }
    }

    if (!input.salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 3. Permission Check
    const hasAccess = await hasSalonPermission(input.salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 4. DB Operation
    const payload = prepareServicePayload(parsed.data)
    let serviceId = parsed.data.id

    // Atualiza serviço existente
    if (serviceId) {
      await db
        .update(services)
        .set(payload)
        .where(and(eq(services.id, serviceId), eq(services.salonId, input.salonId)))
    } else {
      // Cria novo serviço
      const inserted = await db
        .insert(services)
        .values({ ...payload, salonId: input.salonId })
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
          eq(professionals.salonId, input.salonId),
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

    revalidatePath("/dashboard/services")
    return { success: true, data: undefined } // Explicitly return data: undefined for void

  } catch (error) {
    console.error("Erro ao salvar serviço:", error)
    return { error: "Falha ao salvar serviço." }
  }
}

/**
 * Remove um serviço definitivamente (hard delete)
 */
export async function deleteService(id: string, salonId: string): Promise<ActionResult> {
  try {
    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 2. Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 3. DB Operation
    // Remove primeiro as associações com profissionais (cascade)
    await db.delete(professionalServices).where(eq(professionalServices.serviceId, id))
    
    // Remove o serviço definitivamente
    await db
      .delete(services)
      .where(and(eq(services.id, id), eq(services.salonId, salonId)))

    revalidatePath("/dashboard/services")
    return { success: true, data: undefined }

  } catch (error) {
    console.error("Erro ao excluir serviço:", error)
    return { error: "Falha ao excluir serviço." }
  }
}

/**
 * Obtém os IDs dos profissionais associados a um serviço
 */
export async function getServiceLinkedProfessionals(
  serviceId: string,
  salonId: string
): Promise<ActionResult<string[]>> {
  try {
    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Unauthorized" }
    }

    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 2. Permission Check
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 3. DB Operation
    const links = await db.query.professionalServices.findMany({
      where: eq(professionalServices.serviceId, serviceId),
      columns: { professionalId: true },
    })

    return { success: true, data: links.map((link) => link.professionalId) }

  } catch (error) {
    console.error("Erro ao buscar profissionais vinculados:", error)
    return { error: "Falha ao buscar profissionais vinculados." }
  }
}
