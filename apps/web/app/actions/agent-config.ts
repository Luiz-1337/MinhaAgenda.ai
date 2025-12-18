"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types/common"
import { agentConfigSchema, type AgentConfigSchema } from "@/lib/schemas"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"

export async function updateAgentConfig(salonId: string, data: AgentConfigSchema): Promise<ActionResult> {
  const parsed = agentConfigSchema.safeParse(data)
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

  // Verifica se o usuário é o dono do salão e busca settings atual
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true, ownerId: true, settings: true },
  })

  if (!salon) {
    return { error: "Salão não encontrado" }
  }

  if (salon.ownerId !== user.id) {
    return { error: "Você não tem permissão para atualizar este salão" }
  }

  const currentSettings =
    salon.settings && typeof salon.settings === "object" ? (salon.settings as Record<string, unknown>) : {}

  const nextSettings = {
    ...currentSettings,
    agent_config: {
      system_instructions: (parsed.data.system_instructions ?? "").trim(),
      tone: parsed.data.tone,
      isActive: parsed.data.isActive,
    },
  }

  const updateResult = await supabase
    .from("salons")
    .update({
      settings: nextSettings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", salonId)

  if (updateResult.error) {
    return { error: updateResult.error.message }
  }

  revalidatePath(`/${salonId}/agents`)
  return { success: true }
}


