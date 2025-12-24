"use server"

import { createClient } from "@/lib/supabase/server"
import { db, salonCustomers, profiles, salons } from "@repo/db"
import { eq, desc } from "drizzle-orm"
import { ActionResult } from "@/lib/types/common"

import { hasSalonPermission } from "@/lib/services/permissions.service"

export type CustomerRow = {
  id: string
  salonId: string
  profileId: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  birthday: string | null
  marketingOptIn: boolean
  interactionStatus: "new" | "cold" | "recently_scheduled"
  preferences: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/**
 * Obtém todos os clientes de um salão
 */
export async function getSalonCustomers(salonId: string): Promise<ActionResult<CustomerRow[]>> {
  try {
    if (!salonId) {
      return { error: "salonId é obrigatório" }
    }

    // 1. Auth Check
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // 2. Permission Check
    // Verifica se o usuário tem acesso ao salão (Owner ou Manager)
    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // 3. DB Operation
    // Busca os clientes do salão
    const customers = await db
      .select({
        id: salonCustomers.id,
        salonId: salonCustomers.salonId,
        profileId: salonCustomers.profileId,
        notes: salonCustomers.notes,
        birthday: salonCustomers.birthday,
        marketingOptIn: salonCustomers.marketingOptIn,
        interactionStatus: salonCustomers.interactionStatus,
        preferences: salonCustomers.preferences,
        createdAt: salonCustomers.createdAt,
        updatedAt: salonCustomers.updatedAt,
        profileEmail: profiles.email,
        profileFullName: profiles.fullName,
        profilePhone: profiles.phone,
      })
      .from(salonCustomers)
      .innerJoin(profiles, eq(salonCustomers.profileId, profiles.id))
      .where(eq(salonCustomers.salonId, salonId))
      .orderBy(desc(salonCustomers.updatedAt))

    const mappedCustomers = customers.map((customer) => ({
      id: customer.id,
      salonId: customer.salonId,
      profileId: customer.profileId,
      name: customer.profileFullName || customer.profileEmail || "Sem nome",
      email: customer.profileEmail || null,
      phone: customer.profilePhone || null,
      notes: customer.notes || null,
      birthday: customer.birthday ? new Date(customer.birthday).toISOString().split("T")[0] : null,
      marketingOptIn: customer.marketingOptIn,
      interactionStatus: customer.interactionStatus as "new" | "cold" | "recently_scheduled",
      preferences: customer.preferences as Record<string, unknown> | null,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    }))

    return { success: true, data: mappedCustomers }

  } catch (error) {
    console.error("Erro ao buscar clientes:", error)
    return { error: "Falha ao buscar clientes." }
  }
}
