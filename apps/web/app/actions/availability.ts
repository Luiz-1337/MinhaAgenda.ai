"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

type AvailabilityItem = {
  dayOfWeek: number
  startTime: string
  endTime: string
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

export async function getAvailability(
  professionalId: string
): Promise<AvailabilityItem[] | { error: string }> {
  const supabase = await createClient()
  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const prof = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("salon_id", owner.salonId)
    .single()
  if (prof.error || !prof.data) return { error: "Profissional inválido" }

  const rows = await supabase
    .from("availability")
    .select("day_of_week,start_time,end_time,is_break")
    .eq("professional_id", professionalId)
    .eq("is_break", false)
    .order("day_of_week", { ascending: true })
  if (rows.error) return { error: rows.error.message }
  const list = (rows.data || []) as Array<{ day_of_week: number; start_time: string; end_time: string }>
  return list.map((r) => ({ dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time }))
}

const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  isActive: z.boolean(),
})

export async function updateAvailability(
  professionalId: string,
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isActive: boolean }>
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const parsed = z.array(scheduleItemSchema).safeParse(schedule)
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") }

  for (const s of parsed.data) {
    const a = s.startTime.split(":").map((n) => Number(n))
    const b = s.endTime.split(":").map((n) => Number(n))
    const ta = a[0] * 60 + a[1]
    const tb = b[0] * 60 + b[1]
    if (s.isActive && !(ta < tb)) return { error: "Horário inválido" }
  }

  const owner = await getOwnerSalonId()
  if ("error" in owner) return { error: owner.error as string }

  const prof = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("salon_id", owner.salonId)
    .single()
  if (prof.error || !prof.data) return { error: "Profissional inválido" }

  const del = await supabase.from("availability").delete().eq("professional_id", professionalId)
  if (del.error) return { error: del.error.message }

  const toInsert = parsed.data
    .filter((s) => s.isActive)
    .map((s) => ({
      professional_id: professionalId,
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
      is_break: false,
    }))

  if (toInsert.length) {
    const ins = await supabase.from("availability").insert(toInsert)
    if (ins.error) return { error: ins.error.message }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}

