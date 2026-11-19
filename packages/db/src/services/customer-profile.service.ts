import { and, eq } from "drizzle-orm"

import { db, customers } from "../index"
import { planCustomerProfile, type CustomerProfile, type CustomerProfileDraft } from "../domain/customer-profile"
import { brazilToday } from "../domain/finance"
import type { ActionResult } from "./appointments"

/**
 * Dados cadastrais do cliente (docs/ROADMAP.md, fase 7, fatia 7a).
 *
 * Só I/O: a regra pura (domain/customer-profile.ts) valida e normaliza, este
 * arquivo grava. Quem autoriza é a Server Action.
 *
 * Isolamento por salão: o UPDATE leva `salon_id` — o id do cliente chega do
 * navegador.
 */

function pgError(error: unknown): { code?: string; constraint?: string } {
  if (typeof error !== "object" || error === null) return {}
  const direct = error as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown }
  const cause = (typeof direct.cause === "object" && direct.cause !== null ? direct.cause : {}) as {
    code?: string
    constraint_name?: string
    constraint?: string
  }
  return {
    code: direct.code ?? cause.code,
    constraint: direct.constraint_name ?? direct.constraint ?? cause.constraint_name ?? cause.constraint,
  }
}

/** Os dados cadastrais de uma linha de `customers`, no formato da regra. */
export function customerProfileFromRow(row: {
  birthDate: string | null
  cpf: string | null
  gender: string | null
  zipCode: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressDistrict: string | null
  addressCity: string | null
  addressState: string | null
  referralSource: string | null
}): CustomerProfile {
  return {
    birthDate: row.birthDate,
    cpf: row.cpf,
    gender: row.gender === "female" || row.gender === "male" || row.gender === "other" ? row.gender : null,
    zipCode: row.zipCode,
    addressStreet: row.addressStreet,
    addressNumber: row.addressNumber,
    addressComplement: row.addressComplement,
    addressDistrict: row.addressDistrict,
    addressCity: row.addressCity,
    addressState: row.addressState,
    referralSource: row.referralSource,
  }
}

/**
 * Grava os dados cadastrais. Regrava os onze campos: o formulário manda a ficha
 * inteira, e campo em branco apaga o que havia.
 */
export async function updateCustomerProfileService(input: {
  salonId: string
  customerId: string
  draft: CustomerProfileDraft
  now?: Date
}): Promise<ActionResult<CustomerProfile>> {
  try {
    const now = input.now ?? new Date()
    const plan = planCustomerProfile(input.draft, brazilToday(now))
    if (!plan.ok) return { success: false, error: plan.error }

    const updated = await db
      .update(customers)
      .set({ ...plan.profile, updatedAt: now })
      .where(and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)))
      .returning({ id: customers.id })

    if (updated.length === 0) return { success: false, error: "Cliente não encontrado" }
    return { success: true, data: plan.profile }
  } catch (error) {
    const pg = pgError(error)
    if (pg.code === "23505" && pg.constraint === "customers_salon_cpf_unique") {
      return { success: false, error: "Já existe outro cliente com esse CPF neste salão" }
    }
    console.error("Não foi possível salvar os dados cadastrais", error)
    return { success: false, error: "Não foi possível salvar os dados cadastrais" }
  }
}
