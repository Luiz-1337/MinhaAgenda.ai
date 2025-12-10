/**
 * Serviço para operações relacionadas a salões
 * Centraliza a lógica de obtenção do contexto do dono do salão
 */

import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import type { SalonOwnerResult } from "@/lib/types/salon"

/**
 * Obtém o ID do salão do usuário autenticado
 * Retorna erro se o usuário não estiver autenticado ou não tiver salão
 */
export async function getOwnerSalonId(): Promise<SalonOwnerResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Não autenticado" }
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  return {
    salonId: salon.id,
    userId: user.id,
  }
}

/**
 * Verifica se o resultado é um erro
 */
export function isSalonOwnerError(
  result: SalonOwnerResult
): result is Extract<SalonOwnerResult, { error: string }> {
  return "error" in result
}

