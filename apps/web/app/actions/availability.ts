"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { formatZodError, isValidTimeRange } from "@/lib/services/validation.service"
import type { AvailabilityItem, ScheduleItem } from "@/lib/types/availability"
import type { ActionResult } from "@/lib/types/common"

const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  isActive: z.boolean(),
})

/**
 * Obtém a disponibilidade de um profissional
 */
export async function getAvailability(
  professionalId: string,
  salonId: string
): Promise<AvailabilityItem[] | { error: string }> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Verifica se o profissional pertence ao salão
  const profResult = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("salon_id", salonId)
    .single()

  if (profResult.error || !profResult.data) {
    return { error: "Profissional inválido" }
  }

  // Busca horários de disponibilidade
  const availabilityResult = await supabase
    .from("availability")
    .select("day_of_week,start_time,end_time,is_break")
    .eq("professional_id", professionalId)
    .eq("is_break", false)
    .order("day_of_week", { ascending: true })

  if (availabilityResult.error) {
    return { error: availabilityResult.error.message }
  }

  const availabilityData = (availabilityResult.data || []) as Array<{
    day_of_week: number
    start_time: string
    end_time: string
  }>

  return availabilityData.map((item) => ({
    dayOfWeek: item.day_of_week,
    startTime: item.start_time,
    endTime: item.end_time,
  }))
}

/**
 * Atualiza a disponibilidade de um profissional
 */
export async function updateAvailability(
  professionalId: string,
  schedule: ScheduleItem[],
  salonId: string
): Promise<ActionResult> {
  if (!salonId) {
    return { error: "salonId é obrigatório" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  // Validação dos dados de entrada
  const parsed = z.array(scheduleItemSchema).safeParse(schedule)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  // Validação de horários
  for (const item of parsed.data) {
    if (item.isActive && !isValidTimeRange(item.startTime, item.endTime)) {
      return { error: "Horário inválido: início deve ser anterior ao fim" }
    }
  }

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Verifica se o profissional pertence ao salão
  const profResult = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("salon_id", salonId)
    .single()

  if (profResult.error || !profResult.data) {
    return { error: "Profissional inválido" }
  }

  // Remove disponibilidade existente
  const deleteResult = await supabase
    .from("availability")
    .delete()
    .eq("professional_id", professionalId)

  if (deleteResult.error) {
    return { error: deleteResult.error.message }
  }

  // Insere novos horários ativos
  const activeSchedules = parsed.data.filter((item) => item.isActive)
  if (activeSchedules.length > 0) {
    const toInsert = activeSchedules.map((item) => ({
      professional_id: professionalId,
      day_of_week: item.dayOfWeek,
      start_time: item.startTime,
      end_time: item.endTime,
      is_break: false,
    }))

    const insertResult = await supabase.from("availability").insert(toInsert)
    if (insertResult.error) {
      return { error: insertResult.error.message }
    }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}
