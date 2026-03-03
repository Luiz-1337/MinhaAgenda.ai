"use server"

import { createClient } from "@/lib/supabase/server"
import { getSalonRemainingCredits } from "@/lib/services/credits.service"

/**
 * Obtém os créditos restantes do salão baseado no plano do usuário.
 * Rota protegida executada a partir do lado do cliente / server components.
 */
export async function getRemainingCredits(
  salonId: string
): Promise<{ remaining: number; total: number; used: number } | { error: string }> {
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

  return getSalonRemainingCredits(salonId)
}
