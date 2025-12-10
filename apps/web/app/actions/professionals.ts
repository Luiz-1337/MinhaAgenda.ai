"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getOwnerSalonId, isSalonOwnerError } from "@/lib/services/salon.service"
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
 * Obtém todos os profissionais do salão do usuário autenticado
 */
export async function getProfessionals(): Promise<ProfessionalRow[] | { error: string }> {
  const supabase = await createClient()
  const ownerResult = await getOwnerSalonId()

  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  const result = await supabase
    .from("professionals")
    .select("id,salon_id,name,email,phone,is_active,created_at")
    .eq("salon_id", ownerResult.salonId)
    .order("name", { ascending: true })

  if (result.error) {
    return { error: result.error.message }
  }

  return (result.data || []) as ProfessionalRow[]
}

/**
 * Cria ou atualiza um profissional
 */
export async function upsertProfessional(
  input: UpsertProfessionalInput
): Promise<ActionResult> {
  const supabase = await createClient()

  // Validação
  const parsed = upsertProfessionalSchema.safeParse(input)
  if (!parsed.success) {
    return { error: formatZodError(parsed.error) }
  }

  // Verifica autenticação e propriedade do salão
  const ownerResult = await getOwnerSalonId()
  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  // Prepara dados para inserção/atualização
  const payload = {
    salon_id: ownerResult.salonId,
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
      .eq("salon_id", ownerResult.salonId)

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
export async function deleteProfessional(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const ownerResult = await getOwnerSalonId()

  if (isSalonOwnerError(ownerResult)) {
    return { error: ownerResult.error }
  }

  const updateResult = await supabase
    .from("professionals")
    .update({ is_active: false })
    .eq("id", id)
    .eq("salon_id", ownerResult.salonId)

  if (updateResult.error) {
    return { error: updateResult.error.message }
  }

  revalidatePath("/dashboard/team")
  return { success: true }
}
