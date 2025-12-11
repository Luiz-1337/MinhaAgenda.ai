"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { type CreateSalonSchema, type UpdateSalonSchema } from "@/lib/schemas"
import type { ActionResult } from "@/lib/types/common"
import { db, salons } from "@repo/db"
import { eq, asc } from "drizzle-orm"

export type CreateSalonResult = ActionResult<{ salonId: string }>

export type SalonListItem = {
  id: string
  name: string
  slug: string
  whatsapp?: string | null
}

export type SalonDetails = {
  id: string
  name: string
  slug: string
  whatsapp?: string | null
  address?: string | null
  phone?: string | null
  description?: string | null
  workHours?: Record<string, { start: string; end: string }> | null
  settings?: {
    accepts_card?: boolean
    parking?: boolean
    late_tolerance_minutes?: number
    cancellation_policy?: string
  } | null
}

/**
 * Busca todos os salões do usuário autenticado
 */
export async function getUserSalons(): Promise<SalonListItem[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  const userSalons = await db.query.salons.findMany({
    where: eq(salons.ownerId, user.id),
    columns: {
      id: true,
      name: true,
      slug: true,
      whatsapp: true,
    },
    orderBy: asc(salons.name),
  })

  return userSalons
}

/**
 * Cria um novo salão para o usuário autenticado
 */
export async function createSalon(data: CreateSalonSchema): Promise<CreateSalonResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const insertResult = await supabase
    .from("salons")
    .insert({
      owner_id: user.id,
      name: data.name,
      slug: data.slug,
      whatsapp: data.whatsapp || null,
      address: data.address || null,
      phone: data.phone || null,
      description: data.description || null,
      work_hours: data.workHours || null,
      settings: data.settings || null,
    })
    .select("id")
    .single()

  if (insertResult.error) {
    return { error: insertResult.error.message }
  }

  // Atualiza o perfil do usuário para admin
  await supabase.from("profiles").update({ system_role: "admin" }).eq("id", user.id)

  revalidatePath("/")
  return { success: true, data: { salonId: insertResult.data.id } }
}

/**
 * Busca os dados completos do salão atual
 */
export async function getCurrentSalon(salonId: string): Promise<SalonDetails | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      name: true,
      slug: true,
      whatsapp: true,
      address: true,
      phone: true,
      description: true,
      workHours: true,
      settings: true,
      ownerId: true, // Inclui ownerId para verificação
    },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  // Verifica se o usuário é o dono do salão
  if (salon.ownerId !== user.id) {
    return { error: "Você não tem permissão para acessar este salão" }
  }

  return {
    id: salon.id,
    name: salon.name,
    slug: salon.slug,
    whatsapp: salon.whatsapp ?? undefined,
    address: salon.address ?? undefined,
    phone: salon.phone ?? undefined,
    description: salon.description ?? undefined,
    workHours: (salon.workHours as Record<string, { start: string; end: string }> | null) ?? undefined,
    settings: (salon.settings as {
      accepts_card?: boolean
      parking?: boolean
      late_tolerance_minutes?: number
      cancellation_policy?: string
    } | null) ?? undefined,
  }
}

/**
 * Atualiza os dados do salão
 */
export async function updateSalon(
  salonId: string,
  data: UpdateSalonSchema
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o usuário é o dono do salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  if (salon.ownerId !== user.id) {
    return { error: "Você não tem permissão para atualizar este salão" }
  }

  const updateResult = await supabase
    .from("salons")
    .update({
      name: data.name,
      whatsapp: data.whatsapp || null,
      address: data.address || null,
      phone: data.phone || null,
      description: data.description || null,
      work_hours: data.workHours || null,
      settings: data.settings || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", salonId)

  if (updateResult.error) {
    return { error: updateResult.error.message }
  }

  revalidatePath("/dashboard/settings")
  revalidatePath("/")
  return { success: true }
}
