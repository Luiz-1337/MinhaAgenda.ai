"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import type { UpdateProfileSchema } from "@/lib/schemas"
import { db, profiles } from "@repo/db"
import { eq } from "drizzle-orm"

export type ProfileDetails = {
  id: string
  email: string
  fullName?: string | null
  phone?: string | null
  calendarSyncEnabled: boolean
  systemRole: "admin" | "user"
  userTier?: "standard" | "advanced" | "professional" | null
}

/**
 * Busca os dados do perfil do usuário autenticado
 */
export async function getCurrentProfile(): Promise<ProfileDetails | { error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: {
      id: true,
      email: true,
      fullName: true,
      phone: true,
      calendarSyncEnabled: true,
      systemRole: true,
      userTier: true,
    },
  })

  if (!profile) {
    return { error: "Perfil não encontrado" }
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName ?? undefined,
    phone: profile.phone ?? undefined,
    calendarSyncEnabled: profile.calendarSyncEnabled,
    systemRole: profile.systemRole,
    userTier: profile.userTier ?? undefined,
  }
}

/**
 * Atualiza os dados do perfil do usuário autenticado
 */
export async function updateProfile(
  data: UpdateProfileSchema
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const updateResult = await supabase
    .from("profiles")
    .update({
      full_name: data.fullName || null,
      phone: data.phone || null,
      calendar_sync_enabled: data.calendarSyncEnabled ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id)

  if (updateResult.error) {
    return { error: updateResult.error.message }
  }

  revalidatePath("/dashboard/settings")
  revalidatePath("/")
  return { success: true }
}

