"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { ActionState } from "@/lib/types/common"
import { formatAuthError } from "@/lib/services/error.service"
import { normalizeEmail, normalizeString } from "@/lib/services/validation.service"

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

  redirect("/")
}
