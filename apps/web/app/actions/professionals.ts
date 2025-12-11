"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { formatZodError } from "@/lib/services/validation.service"
import { normalizeEmail, normalizeString, emptyStringToNull } from "@/lib/services/validation.service"
import type { ProfessionalRow, UpsertProfessionalInput } from "@/lib/types/professional"
import type { ActionResult } from "@/lib/types/common"

const upsertProfessionalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
})

export type { UpsertProfessionalInput }

/**
 * Obtém todos os profissionais de um salão
 */
export async function getProfessionals(salonId: string): Promise<ProfessionalRow[] | { error: string }> {
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

  // Verifica se o usuário tem acesso ao salão (é dono ou tem permissão)
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  const result = await supabase
    .from("professionals")
    .select("id,salon_id,name,email,phone,is_active,created_at")
    .eq("salon_id", salonId)
    .order("name", { ascending: true })

  if (result.error) {
    return { error: result.error.message }
  }

  const professionals = (result.data || []) as ProfessionalRow[]

  if (professionals.length === 0) {
    return professionals
  }

  // Busca todos os dias trabalhados de uma vez
  const professionalIds = professionals.map((p) => p.id)
  const availabilityResult = await supabase
    .from("availability")
    .select("professional_id,day_of_week")
    .in("professional_id", professionalIds)
    .eq("is_break", false)

  // Agrupa os dias por profissional
  const daysByProfessional = new Map<string, Set<number>>()
  
  if (!availabilityResult.error && availabilityResult.data) {
    for (const item of availabilityResult.data as Array<{ professional_id: string; day_of_week: number }>) {
      if (!daysByProfessional.has(item.professional_id)) {
        daysByProfessional.set(item.professional_id, new Set())
      }
      daysByProfessional.get(item.professional_id)!.add(item.day_of_week)
    }
  }

  // Atribui os dias a cada profissional
  for (const professional of professionals) {
    const daysSet = daysByProfessional.get(professional.id)
    if (daysSet) {
      professional.working_days = Array.from(daysSet).sort((a, b) => a - b)
    } else {
      professional.working_days = []
    }
  }

  return professionals
}

/**
 * Cria ou atualiza um profissional
 */
export async function upsertProfessional(
  input: UpsertProfessionalInput & { salonId: string }
): Promise<ActionResult> {
  const supabase = await createClient()

  // Validação
  const parsed = upsertProfessionalSchema.safeParse(input)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  if (!input.salonId) {
    return { error: "salonId é obrigatório" }
  }

  // Verifica autenticação e propriedade do salão
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, input.salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  // Prepara dados para inserção/atualização
  const payload = {
    salon_id: input.salonId,
    name: normalizeString(parsed.data.name),
    email: normalizeEmail(parsed.data.email),
    phone: emptyStringToNull(parsed.data.phone),
    is_active: parsed.data.isActive,
  }

  // Atualiza profissional existente
  if (parsed.data.id) {
    const updateResult = await supabase
      .from("professionals")
      .update(payload)
      .eq("id", parsed.data.id)
      .eq("salon_id", input.salonId)

    if (updateResult.error) {
      return { error: updateResult.error.message }
    }
  } else {
    // Cria novo profissional
    const insertResult = await supabase.from("professionals").insert(payload)
    if (insertResult.error) {
      return { error: insertResult.error.message }
    }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}

/**
 * Remove um profissional (soft delete)
 */
export async function deleteProfessional(id: string, salonId: string): Promise<ActionResult> {
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

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  const updateResult = await supabase
    .from("professionals")
    .update({ is_active: false })
    .eq("id", id)
    .eq("salon_id", salonId)

  if (updateResult.error) {
    return { error: updateResult.error.message }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}
