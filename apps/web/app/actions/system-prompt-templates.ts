"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import {
  createSystemPromptTemplateSchema,
  updateSystemPromptTemplateSchema,
  type SystemPromptTemplateSchema,
} from "@/lib/schemas"
import type { SystemPromptTemplateRow } from "@/lib/types/system-prompt-template"
import { db, systemPromptTemplates, profiles } from "@repo/db"
import { eq, and, or, isNull } from "drizzle-orm"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { emptyStringToNull } from "@/lib/services/validation.service"

/**
 * Verifica se o usuário é admin do sistema
 */
async function isAdmin(userId: string): Promise<boolean> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
    columns: { systemRole: true },
  })

  return profile?.systemRole === "admin"
}

/**
 * Obtém todos os templates disponíveis para um salão
 * Retorna templates globais (salon_id = null) + templates específicos do salão
 */
export async function getSystemPromptTemplates(
  salonId: string
): Promise<ActionResult<SystemPromptTemplateRow[]>> {
  try {
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

    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Busca templates globais (salon_id = null) e templates do salão específico
    const rows = await db.query.systemPromptTemplates.findMany({
      where: or(
        isNull(systemPromptTemplates.salonId), // Templates globais
        eq(systemPromptTemplates.salonId, salonId) // Templates do salão
      ),
      orderBy: (templates, { asc, desc }) => [
        desc(templates.salonId), // Templates do salão primeiro
        asc(templates.name),
      ],
    })

    const formattedRows: SystemPromptTemplateRow[] = rows
      .filter((row) => row.isActive) // Apenas templates ativos
      .map((row) => ({
        id: row.id,
        salonId: row.salonId,
        name: row.name,
        description: row.description,
        systemPrompt: row.systemPrompt,
        category: row.category,
        isActive: row.isActive,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }))

    return { success: true, data: formattedRows }
  } catch (error) {
    console.error("Erro ao buscar templates:", error)
    return { error: "Falha ao buscar templates." }
  }
}

/**
 * Obtém um template específico
 */
export async function getSystemPromptTemplate(
  salonId: string,
  templateId: string
): Promise<ActionResult<SystemPromptTemplateRow>> {
  try {
    if (!salonId || !templateId) {
      return { error: "salonId e templateId são obrigatórios" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    const row = await db.query.systemPromptTemplates.findFirst({
      where: and(
        or(
          isNull(systemPromptTemplates.salonId), // Template global
          eq(systemPromptTemplates.salonId, salonId) // Template do salão
        ),
        eq(systemPromptTemplates.id, templateId)
      ),
    })

    if (!row) {
      return { error: "Template não encontrado" }
    }

    const formattedRow: SystemPromptTemplateRow = {
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      description: row.description,
      systemPrompt: row.systemPrompt,
      category: row.category,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }

    return { success: true, data: formattedRow }
  } catch (error) {
    console.error("Erro ao buscar template:", error)
    return { error: "Falha ao buscar template." }
  }
}

/**
 * Cria um novo template
 * Se isGlobal = true, cria template global (apenas admins)
 * Caso contrário, cria template específico do salão
 */
export async function createSystemPromptTemplate(
  salonId: string,
  data: SystemPromptTemplateSchema
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createSystemPromptTemplateSchema.safeParse(data)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    const isGlobal = parsed.data.isGlobal ?? false

    // Se for template global, verificar se é admin
    if (isGlobal) {
      const userIsAdmin = await isAdmin(user.id)
      if (!userIsAdmin) {
        return { error: "Apenas administradores podem criar templates globais" }
      }
    } else {
      // Se for template do salão, verificar permissão
      const hasAccess = await hasSalonPermission(salonId, user.id)
      if (!hasAccess) {
        return { error: "Acesso negado a este salão" }
      }
    }

    // Cria o template
    const [newTemplate] = await db
      .insert(systemPromptTemplates)
      .values({
        salonId: isGlobal ? null : salonId,
        name: parsed.data.name.trim(),
        description: emptyStringToNull(parsed.data.description),
        systemPrompt: parsed.data.systemPrompt.trim(),
        category: emptyStringToNull(parsed.data.category),
        isActive: parsed.data.isActive,
      })
      .returning({ id: systemPromptTemplates.id })

    revalidatePath(`/${salonId}/agents/templates`)
    return { success: true, data: { id: newTemplate.id } }
  } catch (error) {
    console.error("Erro ao criar template:", error)
    return { error: error instanceof Error ? error.message : "Falha ao criar template." }
  }
}

/**
 * Atualiza um template existente
 */
export async function updateSystemPromptTemplate(
  salonId: string,
  templateId: string,
  data: Partial<SystemPromptTemplateSchema>
): Promise<ActionResult> {
  try {
    const parsed = updateSystemPromptTemplateSchema.safeParse(data)
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Busca o template existente
    const existingTemplate = await db.query.systemPromptTemplates.findFirst({
      where: eq(systemPromptTemplates.id, templateId),
    })

    if (!existingTemplate) {
      return { error: "Template não encontrado" }
    }

    // Verificar permissões
    const isGlobalTemplate = existingTemplate.salonId === null

    if (isGlobalTemplate) {
      // Templates globais: apenas admins podem editar
      const userIsAdmin = await isAdmin(user.id)
      if (!userIsAdmin) {
        return { error: "Apenas administradores podem editar templates globais" }
      }
    } else {
      // Templates do salão: verificar permissão no salão
      if (existingTemplate.salonId !== salonId) {
        return { error: "Template não pertence a este salão" }
      }

      const hasAccess = await hasSalonPermission(salonId, user.id)
      if (!hasAccess) {
        return { error: "Acesso negado a este salão" }
      }
    }

    // Prepara os dados para atualização
    const updateData: Partial<typeof systemPromptTemplates.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name.trim()
    }
    if (parsed.data.description !== undefined) {
      updateData.description = emptyStringToNull(parsed.data.description)
    }
    if (parsed.data.systemPrompt !== undefined) {
      updateData.systemPrompt = parsed.data.systemPrompt.trim()
    }
    if (parsed.data.category !== undefined) {
      updateData.category = emptyStringToNull(parsed.data.category)
    }
    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive
    }

    await db.update(systemPromptTemplates).set(updateData).where(eq(systemPromptTemplates.id, templateId))

    revalidatePath(`/${salonId}/agents/templates`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar template:", error)
    return { error: error instanceof Error ? error.message : "Falha ao atualizar template." }
  }
}

/**
 * Remove um template
 */
export async function deleteSystemPromptTemplate(
  salonId: string,
  templateId: string
): Promise<ActionResult> {
  try {
    if (!salonId || !templateId) {
      return { error: "salonId e templateId são obrigatórios" }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { error: "Não autenticado" }
    }

    // Busca o template existente
    const existingTemplate = await db.query.systemPromptTemplates.findFirst({
      where: eq(systemPromptTemplates.id, templateId),
    })

    if (!existingTemplate) {
      return { error: "Template não encontrado" }
    }

    // Verificar permissões
    const isGlobalTemplate = existingTemplate.salonId === null

    if (isGlobalTemplate) {
      // Templates globais: apenas admins podem deletar
      const userIsAdmin = await isAdmin(user.id)
      if (!userIsAdmin) {
        return { error: "Apenas administradores podem deletar templates globais" }
      }
    } else {
      // Templates do salão: verificar permissão no salão
      if (existingTemplate.salonId !== salonId) {
        return { error: "Template não pertence a este salão" }
      }

      const hasAccess = await hasSalonPermission(salonId, user.id)
      if (!hasAccess) {
        return { error: "Acesso negado a este salão" }
      }
    }

    await db.delete(systemPromptTemplates).where(eq(systemPromptTemplates.id, templateId))

    revalidatePath(`/${salonId}/agents/templates`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao remover template:", error)
    return { error: error instanceof Error ? error.message : "Falha ao remover template." }
  }
}

