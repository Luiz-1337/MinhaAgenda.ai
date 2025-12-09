"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

type ActionState = { error?: string }

export async function login(prevState: ActionState, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "").trim()

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return { error: `${error.message}${(error as { status?: number }).status ? ` (status ${(error as { status?: number }).status})` : ""}` }
  }

  redirect("/")
}

export async function signup(prevState: ActionState, formData: FormData) {
  const full_name = String(formData.get("full_name") || "").trim()
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const password = String(formData.get("password") || "").trim()

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name },
    },
  })
  if (error) {
    return { error: `${error.message}${(error as { status?: number }).status ? ` (status ${(error as { status?: number }).status})` : ""}` }
  }

  redirect("/")
}
