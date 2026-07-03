"use server"

import { getSessionUserId } from "@/lib/supabase/auth"
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

  if (!(await getSessionUserId())) {
    return { error: "Não autenticado" }
  }

  return getSalonRemainingCredits(salonId)
}
