"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString } from "@/lib/services/validation.service"
import { getOwnerSalonId, isSalonOwnerError } from "@/lib/services/salon.service"

/**
 * Realiza login do usuário
 */
export async function login(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""))
  const password = normalizeString(String(formData.get("password") || ""))

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: formatAuthError(error) }
  }

  // Verifica se o usuário tem um salão
  const salonResult = await getOwnerSalonId()
  
  // Se não tiver salão, redireciona para onboarding
  if (isSalonOwnerError(salonResult)) {
    redirect("/onboarding")
  }

  // Se tiver salão, redireciona para o dashboard
  redirect("/")
}

/**
 * Realiza cadastro de novo usuário
 */
export async function signup(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const full_name = normalizeString(String(formData.get("full_name") || ""))
  const email = normalizeEmail(String(formData.get("email") || ""))
  const password = normalizeString(String(formData.get("password") || ""))

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  })

  if (error) {
    return { error: formatAuthError(error) }
  }

  // Novos usuários sempre precisam fazer onboarding
  redirect("/onboarding")
}
