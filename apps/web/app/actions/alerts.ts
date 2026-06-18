"use server"

import { createClient } from "@/lib/supabase/server"
import { listOpenAlerts, resolveAlertById } from "@/lib/services/alerts/alert.service"

export type SalonAlert = {
  id: string
  type: string
  severity: string
  title: string
  createdAt: string | Date
}

/**
 * Lista os alertas abertos de um salão (para o sino no painel).
 */
export async function getSalonAlerts(
  salonId: string
): Promise<{ alerts: SalonAlert[] } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  try {
    const rows = await listOpenAlerts({ salonId, limit: 50 })
    const alerts: SalonAlert[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      severity: r.severity,
      title: r.title,
      createdAt: r.createdAt,
    }))
    return { alerts }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Marca um alerta como resolvido (botão "resolver" no painel).
 */
export async function dismissAlert(id: string): Promise<{ success: true } | { error: string }> {
  if (!id) return { error: "id é obrigatório" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }

  try {
    await resolveAlertById(id)
    return { success: true }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}
