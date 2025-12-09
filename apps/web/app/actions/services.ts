"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

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

export async function getServices(): Promise<ServiceRow[] | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }
  const list = await supabase
    .from("services")
    .select("id,salon_id,name,description,duration,price,is_active,created_at")
    .eq("salon_id", owner.salonId)
    .order("name", { ascending: true })
  if (list.error) return { error: list.error.message }
  return (list.data || []) as ServiceRow[]
}

export async function upsertService(input: UpsertServiceInput): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const parsed = upsertServiceSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues.map((e) => e.message).join("; ") }

  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const payload = {
    salon_id: owner.salonId,
    name: parsed.data.name.trim(),
    description: (parsed.data.description || "").trim() || null,
    duration: parsed.data.duration,
    price: parsed.data.price.toFixed(2),
    is_active: parsed.data.isActive,
  }

  let serviceId = parsed.data.id
  if (parsed.data.id) {
    const update = await supabase
      .from("services")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("salon_id", owner.salonId)
    if (update.error) return { error: update.error.message }
  } else {
    const insert = await supabase.from("services").insert(payload).select("id").single()
    if (insert.error) return { error: insert.error.message }
    serviceId = insert.data.id as string
  }

  const selected = parsed.data.professionalIds
  if (serviceId) {
    const validPros = await supabase
      .from("professionals")
      .select("id")
      .in("id", selected.length ? selected : ["00000000-0000-0000-0000-000000000000"]) // guard for empty IN
      .eq("salon_id", owner.salonId)
    if (validPros.error) return { error: validPros.error.message }
    const ids = (validPros.data || []).map((r: { id: string }) => r.id)

    await supabase.from("professional_services").delete().eq("service_id", serviceId)
    if (ids.length) {
      const rows = ids.map((pid) => ({ professional_id: pid, service_id: serviceId }))
      const ins = await supabase.from("professional_services").insert(rows)
      if (ins.error) return { error: ins.error.message }
    }
  }

  revalidatePath("/dashboard/services")
  return { success: true }
}

export async function deleteService(id: string): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const update = await supabase
    .from("services")
    .update({ is_active: false })
    .eq("id", id)
    .eq("salon_id", owner.salonId)
  if (update.error) return { error: update.error.message }

  revalidatePath("/dashboard/services")
  return { success: true }
}

export async function getServiceLinkedProfessionals(serviceId: string): Promise<string[] | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }
  const list = await supabase
    .from("professional_services")
    .select("professional_id")
    .eq("service_id", serviceId)
  if (list.error) return { error: list.error.message }
  return (list.data || []).map((r: { professional_id: string }) => r.professional_id)
}
