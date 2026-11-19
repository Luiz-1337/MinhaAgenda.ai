"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { updateCustomerProfileService, type CustomerProfile, type PermissionKey } from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"

/**
 * Dados cadastrais do cliente (docs/ROADMAP.md, fase 7, fatia 7a).
 *
 * Toda action começa em `authorizeSalon`: sessão → permissão `customers.*` no
 * salão. O `salonId` chega do cliente, então estar logado não basta (ver
 * __tests__/lib/actions-authz.test.ts). Não há módulo: a ficha do cliente é do
 * produto base.
 */

async function authorizeSalon(
  salonId: string,
  permission: PermissionKey
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await can(salonId, userId, permission))) {
    return { error: "Você não tem permissão para esta ação" }
  }
  return { userId }
}

/** Formato das entradas; a regra (CPF, datas, UF) fica em domain/customer-profile.ts. */
const field = z.string().max(200).nullable()

const updateCustomerProfileSchema = z.object({
  salonId: z.string().uuid(),
  customerId: z.string().uuid(),
  birthDate: field,
  cpf: field,
  gender: field,
  zipCode: field,
  addressStreet: field,
  addressNumber: field,
  addressComplement: field,
  addressDistrict: field,
  addressCity: field,
  addressState: field,
  referralSource: field,
})

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>

/** Grava os dados cadastrais da ficha: nascimento, CPF, gênero, endereço e "como conheceu". */
export async function updateCustomerProfile(input: UpdateCustomerProfileInput): Promise<ActionResult<CustomerProfile>> {
  const auth = await authorizeSalon(input?.salonId, "customers.edit")
  if ("error" in auth) return auth

  const parsed = updateCustomerProfileSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, customerId, ...draft } = parsed.data
  const result = await updateCustomerProfileService({ salonId, customerId, draft })
  if (!result.success) return { error: result.error }

  revalidatePath(`/${salonId}/contacts/${customerId}`)
  return { success: true, data: result.data }
}
