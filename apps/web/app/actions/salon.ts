"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { type CreateSalonSchema } from "@/lib/schemas"

export type CreateSalonResult = { error: string } | { success: true; salonId: string }

export async function createSalon(data: CreateSalonSchema): Promise<CreateSalonResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: "Não autenticado" }
  }

  const insert = await supabase
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

  if (insert.error) {
    return { error: insert.error.message }
  }

  await supabase.from("profiles").update({ system_role: "admin" }).eq("id", user.id)

  revalidatePath("/")
  return { success: true, salonId: insert.data.id }
}
