"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  db,
  salons,
  professionals,
  accessProfiles,
  and,
  asc,
  eq,
  sanitizePermissionKeys,
} from "@repo/db"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { salonHasModule } from "@/lib/services/salon-modules.service"
import { formatZodError } from "@/lib/services/validation.service"
import type { ActionResult } from "@/lib/types/common"
import type {
  AccessProfilesOverview,
  SaveAccessProfileInput,
  SetProfessionalAccessInput,
} from "@/lib/types/access-profile"

/**
 * Perfis de acesso (docs/ROADMAP.md, fase 0).
 *
 * Toda action começa em `authorizeSalon`: sessão → módulo ligado no salão →
 * permissão `access_profiles.manage`. O `salonId` chega do cliente, então estar
 * logado não basta (ver __tests__/lib/actions-authz.test.ts).
 *
 * As permissões que chegam do cliente passam por `sanitizePermissionKeys`: o que
 * não for chave do catálogo é descartado antes de gravar.
 */

async function authorizeSalon(salonId: string): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await salonHasModule(salonId, "access_profiles"))) {
    return { error: "Perfis de acesso não estão disponíveis neste salão" }
  }
  if (!(await can(salonId, userId, "access_profiles.manage"))) {
    return { error: "Sem permissão para gerenciar perfis de acesso" }
  }
  return { userId }
}

const saveProfileSchema = z.object({
  salonId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Informe o nome do perfil").max(60, "Nome muito longo"),
  permissions: z.array(z.string()).max(500),
})

const setAccessSchema = z.discriminatedUnion("mode", [
  z.object({
    salonId: z.string().uuid(),
    professionalId: z.string().uuid(),
    mode: z.literal("role"),
  }),
  z.object({
    salonId: z.string().uuid(),
    professionalId: z.string().uuid(),
    mode: z.literal("profile"),
    accessProfileId: z.string().uuid(),
  }),
  z.object({
    salonId: z.string().uuid(),
    professionalId: z.string().uuid(),
    mode: z.literal("custom"),
    permissions: z.array(z.string()).max(500),
  }),
])

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const code = (error as { code?: unknown; cause?: { code?: unknown } }).code
  const causeCode = (error as { cause?: { code?: unknown } }).cause?.code
  return code === "23505" || causeCode === "23505"
}

/** Perfis do salão e a situação de cada profissional — tudo que a tela precisa. */
export async function getAccessProfilesOverview(
  salonId: string
): Promise<AccessProfilesOverview | { error: string }> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  try {
    const [salon, profileRows, professionalRows] = await Promise.all([
      db.query.salons.findFirst({
        where: eq(salons.id, salonId),
        columns: { ownerId: true },
      }),
      db
        .select({
          id: accessProfiles.id,
          name: accessProfiles.name,
          permissions: accessProfiles.permissions,
        })
        .from(accessProfiles)
        .where(eq(accessProfiles.salonId, salonId))
        .orderBy(asc(accessProfiles.name)),
      db
        .select({
          id: professionals.id,
          name: professionals.name,
          role: professionals.role,
          userId: professionals.userId,
          isActive: professionals.isActive,
          accessProfileId: professionals.accessProfileId,
          customPermissions: professionals.customPermissions,
        })
        .from(professionals)
        .where(eq(professionals.salonId, salonId))
        .orderBy(asc(professionals.name)),
    ])

    const profileIds = new Set(profileRows.map((p) => p.id))
    const memberCount = new Map<string, number>()

    const professionalList = professionalRows.map((row) => {
      const isCustom = row.customPermissions !== null
      // Vínculo com perfil que não é deste salão não conta — mesma regra do guard.
      const profileId = row.accessProfileId && profileIds.has(row.accessProfileId) ? row.accessProfileId : null

      // Personalizado tem prioridade: o perfil gravado junto não está valendo, então
      // não entra na contagem de vinculados.
      if (!isCustom && profileId) {
        memberCount.set(profileId, (memberCount.get(profileId) ?? 0) + 1)
      }

      return {
        id: row.id,
        name: row.name,
        role: row.role === "STAFF" ? ("STAFF" as const) : ("MANAGER" as const),
        isActive: row.isActive,
        hasFullAccess: row.role === "OWNER" || (!!row.userId && row.userId === salon?.ownerId),
        mode: isCustom ? ("custom" as const) : profileId ? ("profile" as const) : ("role" as const),
        accessProfileId: isCustom ? null : profileId,
        customPermissions: isCustom ? sanitizePermissionKeys(row.customPermissions) : null,
      }
    })

    return {
      profiles: profileRows.map((p) => ({
        id: p.id,
        name: p.name,
        permissions: sanitizePermissionKeys(p.permissions),
        memberCount: memberCount.get(p.id) ?? 0,
      })),
      professionals: professionalList,
    }
  } catch (error) {
    console.error("Erro ao listar perfis de acesso:", error)
    return { error: "Não foi possível carregar os perfis de acesso" }
  }
}

/** Cria ou atualiza um perfil. Alterar um perfil vale para todos os vinculados. */
export async function saveAccessProfile(
  input: SaveAccessProfileInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorizeSalon(input?.salonId)
  if ("error" in auth) return auth

  const parsed = saveProfileSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const { salonId, id, name } = parsed.data
  const permissions = sanitizePermissionKeys(parsed.data.permissions)

  try {
    if (id) {
      const [updated] = await db
        .update(accessProfiles)
        .set({ name, permissions, updatedAt: new Date() })
        // salon_id no WHERE: o id chega do cliente e não pode alcançar outro salão.
        .where(and(eq(accessProfiles.id, id), eq(accessProfiles.salonId, salonId)))
        .returning({ id: accessProfiles.id })

      if (!updated) return { error: "Perfil não encontrado" }

      revalidatePath(`/${salonId}/salon-settings/access-profiles`)
      return { success: true, data: { id: updated.id } }
    }

    const [created] = await db
      .insert(accessProfiles)
      .values({ salonId, name, permissions })
      .returning({ id: accessProfiles.id })

    revalidatePath(`/${salonId}/salon-settings/access-profiles`)
    return { success: true, data: { id: created.id } }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Já existe um perfil com este nome" }
    }
    console.error("Erro ao salvar perfil de acesso:", error)
    return { error: "Não foi possível salvar o perfil" }
  }
}

/**
 * Exclui um perfil. Quem estava vinculado volta a seguir o cargo (a FK é
 * ON DELETE SET NULL) — a tela avisa quantos são antes de confirmar.
 */
export async function deleteAccessProfile(salonId: string, profileId: string): Promise<ActionResult> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  if (!z.string().uuid().safeParse(profileId).success) return { error: "Perfil inválido" }

  try {
    const deleted = await db
      .delete(accessProfiles)
      .where(and(eq(accessProfiles.id, profileId), eq(accessProfiles.salonId, salonId)))
      .returning({ id: accessProfiles.id })

    if (deleted.length === 0) return { error: "Perfil não encontrado" }

    revalidatePath(`/${salonId}/salon-settings/access-profiles`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao excluir perfil de acesso:", error)
    return { error: "Não foi possível excluir o perfil" }
  }
}

/** Define de onde vêm as permissões de um profissional: cargo, perfil ou lista própria. */
export async function setProfessionalAccess(input: SetProfessionalAccessInput): Promise<ActionResult> {
  const auth = await authorizeSalon(input?.salonId)
  if ("error" in auth) return auth

  const parsed = setAccessSchema.safeParse(input)
  if (!parsed.success) return { error: formatZodError(parsed.error) }

  const data = parsed.data

  try {
    let values: { accessProfileId: string | null; customPermissions: string[] | null }

    if (data.mode === "profile") {
      // O perfil tem que ser DESTE salão. A FK sozinha aceitaria o id de um perfil
      // de outro salão.
      const profile = await db.query.accessProfiles.findFirst({
        where: and(eq(accessProfiles.id, data.accessProfileId), eq(accessProfiles.salonId, data.salonId)),
        columns: { id: true },
      })
      if (!profile) return { error: "Perfil não encontrado" }
      values = { accessProfileId: profile.id, customPermissions: null }
    } else if (data.mode === "custom") {
      values = { accessProfileId: null, customPermissions: sanitizePermissionKeys(data.permissions) }
    } else {
      values = { accessProfileId: null, customPermissions: null }
    }

    const updated = await db
      .update(professionals)
      .set(values)
      .where(and(eq(professionals.id, data.professionalId), eq(professionals.salonId, data.salonId)))
      .returning({ id: professionals.id })

    if (updated.length === 0) return { error: "Profissional não encontrado" }

    revalidatePath(`/${data.salonId}/salon-settings/access-profiles`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao definir acesso do profissional:", error)
    return { error: "Não foi possível salvar as permissões do profissional" }
  }
}
