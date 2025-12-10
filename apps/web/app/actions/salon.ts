"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { type CreateSalonSchema } from "@/lib/schemas"
import type { ActionResult } from "@/lib/types/common"

export type CreateSalonResult = ActionResult<{ salonId: string }>

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
      address: data.address || null,
      phone: data.phone || null,
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
