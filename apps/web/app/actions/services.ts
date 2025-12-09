"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, asc, eq, inArray } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, professionalServices, professionals, salons, services } from "@repo/db"

const upsertServiceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  duration: z.number().int().positive(),
  price: z.number().positive(),
  isActive: z.boolean().default(true),
  professionalIds: z.array(z.string().uuid()).default([]),
})

export type UpsertServiceInput = z.infer<typeof upsertServiceSchema>

export type ServiceRow = {
  id: string
  salon_id: string
  name: string
  description: string | null
  duration: number
  price: string
  is_active: boolean
}

type ServiceSelect = Pick<
  typeof services.$inferSelect,
  "id" | "salonId" | "name" | "description" | "duration" | "price" | "isActive"
>

async function getOwnerSalonId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" as const }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
  })

  if (!salon) return { error: "Salão não encontrado" as const }
  return { salonId: salon.id }
}

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

export async function upsertService(input: UpsertServiceInput): Promise<{ success: true } | { error: string }> {
  const parsed = upsertServiceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues.map((e) => e.message).join("; ") }

  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  try {
    const payload = {
      name: parsed.data.name.trim(),
      description: (parsed.data.description || "").trim() || null,
      duration: parsed.data.duration,
      price: parsed.data.price.toFixed(2),
      isActive: parsed.data.isActive,
    }

    let serviceId = parsed.data.id
    if (serviceId) {
      await db
        .update(services)
        .set(payload)
        .where(and(eq(services.id, serviceId), eq(services.salonId, owner.salonId)))
    } else {
      const inserted = await db
        .insert(services)
        .values({ ...payload, salonId: owner.salonId })
        .returning({ id: services.id })
      serviceId = inserted[0]?.id
    }

    if (!serviceId) return { error: "Não foi possível salvar o serviço" }

    await db.delete(professionalServices).where(eq(professionalServices.serviceId, serviceId))

    const selected = parsed.data.professionalIds
    if (selected.length) {
      const validPros = await db.query.professionals.findMany({
        where: and(eq(professionals.salonId, owner.salonId), inArray(professionals.id, selected)),
        columns: { id: true },
      })

      const ids = validPros.map((p: { id: string }) => p.id)
      if (ids.length) {
        await db
          .insert(professionalServices)
          .values(ids.map((pid: string) => ({ professionalId: pid, serviceId })))
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar serviço"
    return { error: message }
  }

  revalidatePath("/dashboard/services")
  return { success: true }
}

export async function deleteService(id: string): Promise<{ success: true } | { error: string }> {
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  try {
    await db
      .update(services)
      .set({ isActive: false })
      .where(and(eq(services.id, id), eq(services.salonId, owner.salonId)))
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao remover serviço"
    return { error: message }
  }

  revalidatePath("/dashboard/services")
  return { success: true }
}

export async function getServiceLinkedProfessionals(serviceId: string): Promise<string[] | { error: string }> {
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const links = await db.query.professionalServices.findMany({
    where: eq(professionalServices.serviceId, serviceId),
    columns: { professionalId: true },
  })

  return links.map((row: { professionalId: string }) => row.professionalId)
}
