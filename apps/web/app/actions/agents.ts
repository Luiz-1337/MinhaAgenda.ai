"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import { agentSchema, createAgentSchema, updateAgentSchema, type AgentSchema } from "@/lib/schemas"
import { db, agents, salons, profiles, eq, and, ne } from "@repo/db"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { canAddAgent, getAgentLimit } from "@/lib/utils/permissions"
import { syncExtraAgentBilling } from "@/lib/services/agent-billing.service"
import type { PlanTier } from "@/lib/types/salon"

export type AgentRow = {
  id: string
  salonId: string
  name: string
  systemPrompt: string
  model: string
  tone: "formal" | "informal"
  whatsappNumber: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * Obtém todos os agentes de um salão
 */
export async function getAgents(salonId: string): Promise<ActionResult<AgentRow[]>> {
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

    const rows = await db.query.agents.findMany({
      where: eq(agents.salonId, salonId),
      orderBy: (agents, { desc }) => [desc(agents.createdAt)],
    })

    const formattedRows: AgentRow[] = rows.map((row) => ({
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      systemPrompt: row.systemPrompt,
      model: row.model,
      tone: row.tone as "formal" | "informal",
      whatsappNumber: row.whatsappNumber,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))

    return { success: true, data: formattedRows }
  } catch (error) {
    console.error("Erro ao buscar agentes:", error)
    return { error: "Falha ao buscar agentes." }
  }
}

/**
 * Obtém um agente específico
 */
export async function getAgent(salonId: string, agentId: string): Promise<ActionResult<AgentRow>> {
  try {
    if (!salonId || !agentId) {
      return { error: "salonId e agentId são obrigatórios" }
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

    const row = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.id, agentId)),
    })

    if (!row) {
      return { error: "Agente não encontrado" }
    }

    const formattedRow: AgentRow = {
      id: row.id,
      salonId: row.salonId,
      name: row.name,
      systemPrompt: row.systemPrompt,
      model: row.model,
      tone: row.tone as "formal" | "informal",
      whatsappNumber: row.whatsappNumber,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }

    return { success: true, data: formattedRow }
  } catch (error) {
    console.error("Erro ao buscar agente:", error)
    return { error: "Falha ao buscar agente." }
  }
}

/**
 * Cria um novo agente
 * Se isActive = true, desativa todos os outros agentes do salão
 */
export async function createAgent(
  salonId: string,
  data: AgentSchema
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = createAgentSchema.safeParse(data)
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

    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Verificar limite de agentes por plano
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    })

    if (!salon) {
      return { error: "Salão não encontrado" }
    }

    const ownerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, salon.ownerId),
      columns: { tier: true },
    })

    const planTier = (ownerProfile?.tier as PlanTier) || 'SOLO'

    const existingAgents = await db.query.agents.findMany({
      where: eq(agents.salonId, salonId),
      columns: { id: true },
    })

    if (!canAddAgent(planTier, existingAgents.length)) {
      const limit = getAgentLimit(planTier)
      return {
        error: `Limite de agentes atingido para o plano ${planTier}. Máximo: ${limit} agente${limit > 1 ? 's' : ''}.`,
      }
    }

    // Se o agente será ativado, desativa todos os outros agentes do salão
    if (parsed.data.isActive) {
      await db
        .update(agents)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(agents.salonId, salonId), eq(agents.isActive, true)))
    }

    // Cria o novo agente
    const [newAgent] = await db
      .insert(agents)
      .values({
        salonId,
        name: parsed.data.name.trim(),
        systemPrompt: parsed.data.systemPrompt.trim(),
        model: parsed.data.model,
        tone: parsed.data.tone,
        isActive: parsed.data.isActive,
      })
      .returning({ id: agents.id })

    // Sync billing para Enterprise (agentes extras acima de 3)
    if (planTier === 'ENTERPRISE') {
      try {
        await syncExtraAgentBilling(salonId)
      } catch (err) {
        console.error("Erro ao sincronizar billing de agentes extras:", err)
      }
    }

    revalidatePath(`/${salonId}/agents`)
    return { success: true, data: { id: newAgent.id } }
  } catch (error) {
    console.error("Erro ao criar agente:", error)
    return { error: error instanceof Error ? error.message : "Falha ao criar agente." }
  }
}

/**
 * Atualiza um agente existente
 * Se isActive = true, desativa todos os outros agentes do salão
 */
export async function updateAgent(
  salonId: string,
  agentId: string,
  data: Partial<AgentSchema>
): Promise<ActionResult> {
  try {
    const parsed = updateAgentSchema.safeParse(data)
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

    const hasAccess = await hasSalonPermission(salonId, user.id)

    if (!hasAccess) {
      return { error: "Acesso negado a este salão" }
    }

    // Verifica se o agente existe e pertence ao salão
    const existingAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.id, agentId)),
    })

    if (!existingAgent) {
      return { error: "Agente não encontrado" }
    }

    // Se o agente será ativado, desativa todos os outros agentes do salão
    if (parsed.data.isActive === true) {
      await db
        .update(agents)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(agents.salonId, salonId),
            eq(agents.isActive, true),
            ne(agents.id, agentId) // Exclui o próprio agente que está sendo atualizado
          )
        )
    }

    // Prepara os dados para atualização
    const updateData: Partial<typeof agents.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name.trim()
    }
    if (parsed.data.systemPrompt !== undefined) {
      updateData.systemPrompt = parsed.data.systemPrompt.trim()
    }
    if (parsed.data.model !== undefined) {
      updateData.model = parsed.data.model
    }
    if (parsed.data.tone !== undefined) {
      updateData.tone = parsed.data.tone
    }
    // Nota: whatsappNumber é gerenciado no nível do salão (via /api/salons/[salonId]/whatsapp/)
    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive
    }

    await db.update(agents).set(updateData).where(eq(agents.id, agentId))

    revalidatePath(`/${salonId}/agents`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar agente:", error)
    return { error: error instanceof Error ? error.message : "Falha ao atualizar agente." }
  }
}

/**
 * Remove um agente
 */
export async function deleteAgent(salonId: string, agentId: string): Promise<ActionResult> {
  try {
    if (!salonId || !agentId) {
      return { error: "salonId e agentId são obrigatórios" }
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

    // Verifica se o agente existe e pertence ao salão
    const existingAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.id, agentId)),
    })

    if (!existingAgent) {
      return { error: "Agente não encontrado" }
    }

    await db.delete(agents).where(eq(agents.id, agentId))

    // Sync billing para Enterprise (agentes extras acima de 3)
    try {
      await syncExtraAgentBilling(salonId)
    } catch (err) {
      console.error("Erro ao sincronizar billing de agentes extras após remoção:", err)
    }

    revalidatePath(`/${salonId}/agents`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao remover agente:", error)
    return { error: error instanceof Error ? error.message : "Falha ao remover agente." }
  }
}

/**
 * Alterna o status ativo de um agente
 * Se ativar, desativa todos os outros agentes do salão
 */
export async function toggleAgentActive(
  salonId: string,
  agentId: string
): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    if (!salonId || !agentId) {
      return { error: "salonId e agentId são obrigatórios" }
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

    // Busca o agente
    const existingAgent = await db.query.agents.findFirst({
      where: and(eq(agents.salonId, salonId), eq(agents.id, agentId)),
    })

    if (!existingAgent) {
      return { error: "Agente não encontrado" }
    }

    const newActiveState = !existingAgent.isActive

    // Se será ativado, desativa todos os outros agentes do salão
    if (newActiveState) {
      await db
        .update(agents)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(agents.salonId, salonId),
            eq(agents.isActive, true),
            ne(agents.id, agentId) // Exclui o próprio agente
          )
        )
    }

    // Atualiza o status do agente
    await db
      .update(agents)
      .set({ isActive: newActiveState, updatedAt: new Date() })
      .where(eq(agents.id, agentId))

    revalidatePath(`/${salonId}/agents`)
    return { success: true, data: { isActive: newActiveState } }
  } catch (error) {
    console.error("Erro ao alternar status do agente:", error)
    return { error: error instanceof Error ? error.message : "Falha ao alternar status do agente." }
  }
}

