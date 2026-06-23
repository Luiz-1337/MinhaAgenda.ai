"use server"

import { createClient } from "@/lib/supabase/server"
import {
  db,
  customers,
  customerTags,
  customerTagAssignments,
  eq,
  and,
  asc,
  inArray,
} from "@repo/db"
import { ActionResult } from "@/lib/types/common"
import { hasSalonPermission } from "@/lib/services/permissions.service"

export type TagRow = {
  id: string
  name: string
  color: string
  position: number
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const DEFAULT_COLOR = "#94a3b8"

/**
 * Garante usuário autenticado com permissão no salão.
 * Retorna { userId } em caso de sucesso ou { error } caso contrário.
 */
async function requireSalonAccess(
  salonId: string
): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: "Não autenticado" }

  const hasAccess = await hasSalonPermission(salonId, user.id)
  if (!hasAccess) return { error: "Acesso negado a este salão" }

  return { userId: user.id }
}

function mapTag(t: { id: string; name: string; color: string; position: number }): TagRow {
  return { id: t.id, name: t.name, color: t.color, position: t.position }
}

/**
 * Lista o catálogo de tags do salão (ordenado por position).
 */
export async function getSalonTags(salonId: string): Promise<ActionResult<TagRow[]>> {
  try {
    const access = await requireSalonAccess(salonId)
    if ("error" in access) return { error: access.error }

    const tags = await db.query.customerTags.findMany({
      where: eq(customerTags.salonId, salonId),
      orderBy: asc(customerTags.position),
      columns: { id: true, name: true, color: true, position: true },
    })

    return { success: true, data: tags.map(mapTag) }
  } catch (error) {
    console.error("Erro ao buscar tags:", error)
    return { error: "Falha ao buscar tags." }
  }
}

export type CreateSalonTagInput = {
  salonId: string
  name: string
  color?: string
}

/**
 * Cria uma nova tag no catálogo do salão.
 */
export async function createSalonTag(
  input: CreateSalonTagInput
): Promise<ActionResult<TagRow>> {
  try {
    const access = await requireSalonAccess(input.salonId)
    if ("error" in access) return { error: access.error }

    const name = input.name?.trim() ?? ""
    if (name.length < 1) return { error: "Nome da tag é obrigatório" }
    if (name.length > 30) return { error: "Nome da tag deve ter no máximo 30 caracteres" }

    const color = input.color?.trim() || DEFAULT_COLOR
    if (!HEX_COLOR.test(color)) return { error: "Cor inválida (use hex, ex.: #f59e0b)" }

    // Catálogo atual: dupe case-insensitive + próxima position.
    const existing = await db.query.customerTags.findMany({
      where: eq(customerTags.salonId, input.salonId),
      columns: { name: true, position: true },
    })
    if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      return { error: "Já existe uma tag com esse nome" }
    }
    const nextPosition = existing.reduce((max, t) => Math.max(max, t.position), -1) + 1

    const [created] = await db
      .insert(customerTags)
      .values({ salonId: input.salonId, name, color, position: nextPosition })
      .returning({
        id: customerTags.id,
        name: customerTags.name,
        color: customerTags.color,
        position: customerTags.position,
      })

    return { success: true, data: mapTag(created) }
  } catch (error) {
    console.error("Erro ao criar tag:", error)
    return { error: "Falha ao criar tag." }
  }
}

export type UpdateSalonTagInput = {
  tagId: string
  salonId: string
  name?: string
  color?: string
}

/**
 * Renomeia / recolore uma tag do catálogo.
 */
export async function updateSalonTag(
  input: UpdateSalonTagInput
): Promise<ActionResult<TagRow>> {
  try {
    const access = await requireSalonAccess(input.salonId)
    if ("error" in access) return { error: access.error }

    if (!input.tagId) return { error: "ID da tag é obrigatório" }

    const existing = await db.query.customerTags.findFirst({
      where: and(eq(customerTags.id, input.tagId), eq(customerTags.salonId, input.salonId)),
      columns: { id: true, name: true, color: true, position: true },
    })
    if (!existing) return { error: "Tag não encontrada neste salão" }

    const updates: { name?: string; color?: string; updatedAt?: Date } = {}

    if (input.name !== undefined) {
      const name = input.name.trim()
      if (name.length < 1) return { error: "Nome da tag é obrigatório" }
      if (name.length > 30) return { error: "Nome da tag deve ter no máximo 30 caracteres" }
      if (name.toLowerCase() !== existing.name.toLowerCase()) {
        const others = await db.query.customerTags.findMany({
          where: eq(customerTags.salonId, input.salonId),
          columns: { id: true, name: true },
        })
        if (others.some((t) => t.id !== input.tagId && t.name.toLowerCase() === name.toLowerCase())) {
          return { error: "Já existe uma tag com esse nome" }
        }
      }
      updates.name = name
    }

    if (input.color !== undefined) {
      const color = input.color.trim()
      if (!HEX_COLOR.test(color)) return { error: "Cor inválida (use hex, ex.: #f59e0b)" }
      updates.color = color
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, data: mapTag(existing) }
    }

    updates.updatedAt = new Date()
    const [updated] = await db
      .update(customerTags)
      .set(updates)
      .where(eq(customerTags.id, input.tagId))
      .returning({
        id: customerTags.id,
        name: customerTags.name,
        color: customerTags.color,
        position: customerTags.position,
      })

    return { success: true, data: mapTag(updated) }
  } catch (error) {
    console.error("Erro ao atualizar tag:", error)
    return { error: "Falha ao atualizar tag." }
  }
}

/**
 * Remove uma tag do catálogo. As atribuições caem por ON DELETE CASCADE.
 */
export async function deleteSalonTag(
  tagId: string,
  salonId: string
): Promise<ActionResult> {
  try {
    const access = await requireSalonAccess(salonId)
    if ("error" in access) return { error: access.error }

    if (!tagId) return { error: "ID da tag é obrigatório" }

    const existing = await db.query.customerTags.findFirst({
      where: and(eq(customerTags.id, tagId), eq(customerTags.salonId, salonId)),
      columns: { id: true },
    })
    if (!existing) return { error: "Tag não encontrada neste salão" }

    await db.delete(customerTags).where(eq(customerTags.id, tagId))
    return { success: true }
  } catch (error) {
    console.error("Erro ao remover tag:", error)
    return { error: "Falha ao remover tag." }
  }
}

export type SetCustomerTagsInput = {
  customerId: string
  salonId: string
  tagIds: string[]
}

/**
 * Substitui o conjunto de tags atribuídas a um contato.
 * Retorna as tags resultantes (ordenadas por position) para o cache do cliente.
 */
export async function setCustomerTags(
  input: SetCustomerTagsInput
): Promise<ActionResult<TagRow[]>> {
  try {
    const access = await requireSalonAccess(input.salonId)
    if ("error" in access) return { error: access.error }

    if (!input.customerId) return { error: "ID do contato é obrigatório" }

    // Contato pertence ao salão?
    const customer = await db.query.customers.findFirst({
      where: and(eq(customers.id, input.customerId), eq(customers.salonId, input.salonId)),
      columns: { id: true },
    })
    if (!customer) return { error: "Contato não encontrado neste salão" }

    const tagIds = Array.from(new Set(input.tagIds ?? []))

    // Limpar todas as tags do contato.
    if (tagIds.length === 0) {
      await db
        .delete(customerTagAssignments)
        .where(eq(customerTagAssignments.customerId, input.customerId))
      return { success: true, data: [] }
    }

    // Todas as tags precisam pertencer ao salão.
    const validTags = await db.query.customerTags.findMany({
      where: and(eq(customerTags.salonId, input.salonId), inArray(customerTags.id, tagIds)),
      columns: { id: true, name: true, color: true, position: true },
      orderBy: asc(customerTags.position),
    })
    if (validTags.length !== tagIds.length) {
      return { error: "Uma ou mais tags não pertencem a este salão" }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(customerTagAssignments)
        .where(eq(customerTagAssignments.customerId, input.customerId))
      await tx.insert(customerTagAssignments).values(
        validTags.map((t) => ({
          customerId: input.customerId,
          tagId: t.id,
          salonId: input.salonId,
        }))
      )
    })

    return { success: true, data: validTags.map(mapTag) }
  } catch (error) {
    console.error("Erro ao definir tags do contato:", error)
    return { error: "Falha ao salvar as tags do contato." }
  }
}
