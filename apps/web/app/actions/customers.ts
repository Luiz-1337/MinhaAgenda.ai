"use server"

import { createClient } from "@/lib/supabase/server"
import { db, salonCustomers, profiles, salons } from "@repo/db"
import { eq, desc } from "drizzle-orm"

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
export async function getSalonCustomers(salonId: string): Promise<CustomerRow[] | { error: string }> {
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

  // Verifica se o usuário tem acesso ao salão
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: {
      id: true,
      ownerId: true,
    },
  })

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

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

  return customers.map((customer) => ({
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
}

