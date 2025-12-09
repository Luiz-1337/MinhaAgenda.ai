"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const upsertProfessionalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

export type UpsertProfessionalInput = z.infer<typeof upsertProfessionalSchema>

export type ProfessionalRow = {
  id: string
  salon_id: string
  name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
}

async function getOwnerSalonId() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" as const }
  const salon = await supabase.from("salons").select("id").eq("owner_id", user.id).single()
  if (salon.error || !salon.data) return { error: "Salão não encontrado" as const }
  return { salonId: salon.data.id }
}

export async function getProfessionals(): Promise<ProfessionalRow[] | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }
  const list = await supabase
    .from("professionals")
    .select("id,salon_id,name,email,phone,is_active,created_at")
    .eq("salon_id", owner.salonId)
    .order("name", { ascending: true })
  if (list.error) return { error: list.error.message as string}
  return (list.data || []) as ProfessionalRow[]
}

export async function upsertProfessional(input: UpsertProfessionalInput): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const parsed = upsertProfessionalSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") }

  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const payload = {
    salon_id: owner.salonId,
    name: parsed.data.name.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    phone: (parsed.data.phone || "").trim() || null,
    is_active: parsed.data.isActive,
  }

  if (parsed.data.id) {
    const update = await supabase
      .from("professionals")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("salon_id", owner.salonId)
    if (update.error) return { error: update.error.message }
  } else {
    const insert = await supabase.from("professionals").insert(payload)
    if (insert.error) return { error: insert.error.message }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}

export async function deleteProfessional(id: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const update = await supabase
    .from("professionals")
    .update({ is_active: false })
    .eq("id", id)
    .eq("salon_id", owner.salonId)
  if (update.error) return { error: update.error.message as string }

  revalidatePath("/dashboard/team")
  return { success: true }
}

