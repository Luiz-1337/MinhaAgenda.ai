"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { type CreateSalonSchema, type UpdateSalonSchema } from "@/lib/schemas"
import type { ActionResult } from "@/lib/types/common"
import { db, salons, professionals } from "@repo/db"
import { eq, asc, or, and } from "drizzle-orm"
import type { SalonListItem } from "@/lib/types/salon"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { createSalonWithOwner } from "@/lib/services/salon.service"

export type CreateSalonResult = ActionResult<{ salonId: string }>

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
    agent_config?: {
      system_instructions?: string
      tone?: "formal" | "informal"
      isActive?: boolean
    }
  } | null
}

/**
 * Busca todos os salões do usuário autenticado (como dono ou profissional)
 */
export async function getUserSalons(): Promise<SalonListItem[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return []
  }

  const result = await db
    .select({
      id: salons.id,
      name: salons.name,
      slug: salons.slug,
      whatsapp: salons.whatsapp,
      planTier: salons.planTier,
      ownerId: salons.ownerId,
      professionalRole: professionals.role
    })
    .from(salons)
    .leftJoin(
      professionals, 
      and(
        eq(professionals.salonId, salons.id), 
        eq(professionals.userId, user.id)
      )
    )
    .where(
      or(
        eq(salons.ownerId, user.id),
        eq(professionals.userId, user.id)
      )
    )
    .orderBy(asc(salons.name))

  return result.map(s => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    whatsapp: s.whatsapp,
    planTier: s.planTier,
    // Prioridade: Se é dono -> MANAGER, senão usa a role do profissional (se for OWNER vira MANAGER), senão STAFF
    role: (s.ownerId === user.id || s.professionalRole === 'OWNER' || s.professionalRole === 'MANAGER') ? 'MANAGER' : 'STAFF'
  }))
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

  try {
    const newSalon = await createSalonWithOwner(user.id, data)
    
    revalidatePath("/")
    return { success: true, data: { salonId: newSalon.id } }
  } catch (error) {
    console.error("Erro detalhado em createSalon:", error)
    return { error: error instanceof Error ? error.message : "Erro ao criar salão" }
  }
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
      ownerId: true,
    },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  // Verifica permissão: Dono ou Profissional vinculado
  if (salon.ownerId !== user.id) {
    const professional = await db.query.professionals.findFirst({
      where: and(eq(professionals.salonId, salonId), eq(professionals.userId, user.id))
    })
    
    if (!professional) {
      return { error: "Você não tem permissão para acessar este salão" }
    }
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
      agent_config?: {
        system_instructions?: string
        tone?: "formal" | "informal"
        isActive?: boolean
      }
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

  // Verifica permissão (Owner ou Manager)
  const hasAccess = await hasSalonPermission(salonId, user.id)

  if (!hasAccess) {
    return { error: "Você não tem permissão para atualizar este salão" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true, settings: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  // IMPORTANT: mescla settings para não sobrescrever chaves desconhecidas (ex.: settings.agent_config)
  const existingSettings =
    salon.settings && typeof salon.settings === "object" ? (salon.settings as Record<string, unknown>) : {}
  const incomingSettings =
    data.settings && typeof data.settings === "object" ? (data.settings as Record<string, unknown>) : undefined
  const mergedSettings =
    incomingSettings ? ({ ...existingSettings, ...incomingSettings } as Record<string, unknown>) : existingSettings

  const updateResult = await supabase
    .from("salons")
    .update({
      name: data.name,
      whatsapp: data.whatsapp || null,
      address: data.address || null,
      phone: data.phone || null,
      description: data.description || null,
      work_hours: data.workHours || null,
      settings: Object.keys(mergedSettings).length > 0 ? mergedSettings : null,
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
