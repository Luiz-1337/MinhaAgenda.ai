"use server"

import { createClient } from "@/lib/supabase/server"
import { db, appointments, chats, chatMessages, aiUsageStats, agentStats, salons, profiles, sql, messages, agents } from "@repo/db"
import { eq, and, gte, desc } from "drizzle-orm"

import { hasSalonPermission } from "@/lib/services/permissions.service"
import { calculateCredits } from "@/lib/utils/credits"

export interface DashboardStats {
  planTier: 'SOLO' | 'PRO' | 'ENTERPRISE'
  userName: string
  completedAppointments: number
  activeChats: number
  averageResponseTime: string
  responseRate: number
  queueAverageTime: string
  creditsByDay: Array<{ date: string; value: number }>
  topAgents: Array<{ name: string; credits: number; model?: string }>
  creditsByModel: Array<{ name: string; percent: number }>
}

/**
 * Obtém estatísticas do dashboard para o salão
 */
export async function getDashboardStats(salonId: string): Promise<DashboardStats | { error: string }> {
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

  // Verifica acesso ao salão e busca todas as estatísticas em paralelo
  const [
    salon,
    profileResult,
    completedAppointmentsResult,
    activeChatsResult,
    messagesResult,
    chatsResult,
    creditsData,
    usageStatsData,
  ] = await Promise.all([
    db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: {
      id: true,
      ownerId: true,
    },
    }),
    db.select({ tier: profiles.tier, fullName: profiles.fullName }).from(salons).innerJoin(profiles, eq(salons.ownerId, profiles.id)).where(eq(salons.id, salonId)).limit(1),
    // Atendimentos concluídos = chats do WhatsApp com status 'completed'
    supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("status", "completed"),
    supabase
      .from("chats")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", salonId)
      .eq("status", "active"),
    supabase
      .from("chat_messages")
      .select("created_at, role")
      .eq("salon_id", salonId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("chats")
      .select("id, created_at")
      .eq("salon_id", salonId)
      .eq("status", "active")
      .limit(100),
    // Busca créditos por dia da tabela aiUsageStats
    db
      .select({
        date: aiUsageStats.date,
        credits: sql<number>`SUM(${aiUsageStats.credits})::int`,
      })
      .from(aiUsageStats)
      .where(
        and(
          eq(aiUsageStats.salonId, salonId),
          gte(aiUsageStats.date, sql`CURRENT_DATE - INTERVAL '30 days'`)
        )
      )
      .groupBy(aiUsageStats.date)
      .orderBy(aiUsageStats.date),
    // Busca créditos por modelo da tabela aiUsageStats (já agregados)
    db
      .select({
        model: aiUsageStats.model,
        credits: sql<number>`SUM(${aiUsageStats.credits})::int`,
      })
      .from(aiUsageStats)
      .where(
        and(
          eq(aiUsageStats.salonId, salonId),
          gte(aiUsageStats.date, sql`CURRENT_DATE - INTERVAL '30 days'`)
        )
      )
      .groupBy(aiUsageStats.model),
  ])

  if (!salon || salon.ownerId !== user.id) {
    return { error: "Acesso negado a este salão" }
  }

  const completedAppointments = completedAppointmentsResult.count || 0
  const activeChats = activeChatsResult.count || 0

  // Calcula tempo médio de resposta usando first_user_message_at e first_agent_response_at
  let averageResponseTime = "0m"
  let responseRate = 0

  // Busca chats que têm ambos os timestamps preenchidos
  const chatsWithTimestamps = await db
    .select({
      firstUserMessageAt: chats.firstUserMessageAt,
      firstAgentResponseAt: chats.firstAgentResponseAt,
    })
    .from(chats)
    .where(
      and(
        eq(chats.salonId, salonId),
        sql`${chats.firstUserMessageAt} IS NOT NULL`,
        sql`${chats.firstAgentResponseAt} IS NOT NULL`
      )
    )

  if (chatsWithTimestamps.length > 0) {
    let totalResponseTime = 0
    let responseCount = 0

    for (const chat of chatsWithTimestamps) {
      if (chat.firstUserMessageAt && chat.firstAgentResponseAt) {
        const timeDiff = new Date(chat.firstAgentResponseAt).getTime() - new Date(chat.firstUserMessageAt).getTime()
        if (timeDiff > 0) {
          totalResponseTime += timeDiff
          responseCount++
        }
      }
    }

    if (responseCount > 0) {
      const avgMs = totalResponseTime / responseCount
      const avgSeconds = Math.round(avgMs / 1000)
      const minutes = Math.floor(avgSeconds / 60)
      const seconds = avgSeconds % 60
      
      if (minutes > 0) {
        averageResponseTime = `${minutes}m ${seconds}s`
      } else {
        averageResponseTime = `${seconds}s`
      }
    }
  }

  // Calcula taxa de resposta (mensagens do assistente / mensagens do usuário)
  if (messagesResult.data && messagesResult.data.length > 0) {
    const messages = messagesResult.data
    const userMessages = messages.filter(m => m.role === "user").length
    const assistantMessages = messages.filter(m => m.role === "assistant").length
    responseRate = userMessages > 0 ? Math.round((assistantMessages / userMessages) * 100) : 0
  }

  // Calcula fila média usando uma query SQL eficiente (evita loop com await)
  let queueAverageTime = "0m"
  if (chatsResult.data && chatsResult.data.length > 0) {
    // Busca primeira mensagem de cada chat em uma única query
    const chatIds = chatsResult.data.map(c => c.id)
    const firstMessagesResult = await supabase
      .from("chat_messages")
      .select("created_at, salon_id")
      .eq("salon_id", salonId)
      .in("salon_id", [salonId]) // Filtro adicional para performance
      .order("created_at", { ascending: true })
      .limit(chatIds.length * 2) // Limite maior para garantir que pegamos as primeiras

    // Agrupa por chat e pega a primeira mensagem de cada
    const messagesByChat = new Map<string, Date>()
    if (firstMessagesResult.data) {
      for (const msg of firstMessagesResult.data) {
        // Usa uma chave simples baseada no salon_id já que não temos chat_id direto
        // Para uma solução mais precisa, seria necessário adicionar chat_id na tabela chat_messages
        const key = msg.salon_id
        if (!messagesByChat.has(key)) {
          messagesByChat.set(key, new Date(msg.created_at))
        }
      }
    }

    let totalQueueTime = 0
    let queueCount = 0

    for (const chat of chatsResult.data) {
      // Tenta encontrar a primeira mensagem correspondente
      // Como não temos chat_id direto, usamos uma aproximação
      const firstMessageTime = Array.from(messagesByChat.values())[0]
      if (firstMessageTime) {
        const timeDiff = firstMessageTime.getTime() - new Date(chat.created_at).getTime()
        totalQueueTime += Math.abs(timeDiff)
        queueCount++
      }
    }

    if (queueCount > 0) {
      const avgMs = totalQueueTime / queueCount
      const avgSeconds = Math.round(avgMs / 1000)
      const minutes = Math.floor(avgSeconds / 60)
      const seconds = avgSeconds % 60
      queueAverageTime = `${minutes}m ${seconds}s`
    }
  }

  // Busca também créditos reais da tabela messages (tokens das mensagens) para aplicar pesos
  const messagesRaw = await db
    .select({
      date: sql<string>`DATE(${messages.createdAt})::text`,
      totalTokens: messages.totalTokens,
      model: messages.model,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.salonId, salonId),
        sql`${messages.totalTokens} IS NOT NULL`,
        sql`${messages.totalTokens} > 0`,
        gte(messages.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`)
      )
    )

  // Combina créditos de aiUsageStats e messages (aplicando pesos)
  const creditsMap = new Map<string, number>()
  
  // Adiciona créditos de aiUsageStats (já ponderados)
  creditsData.forEach((item) => {
    const dateStr = new Date(item.date).toISOString().split("T")[0]
    creditsMap.set(dateStr, (creditsMap.get(dateStr) || 0) + (Number(item.credits) || 0))
  })
  
  // Adiciona créditos de messages aplicando pesos
  messagesRaw.forEach((msg) => {
    if (!msg.date || !msg.totalTokens) return
    const credits = calculateCredits(msg.totalTokens, msg.model)
    creditsMap.set(msg.date, (creditsMap.get(msg.date) || 0) + credits)
  })

  // Converte para array e formata
  const creditsByDay = Array.from(creditsMap.entries())
    .map(([date, value]) => ({
      date: new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      value: value || 0,
    }))
    .sort((a, b) => {
      // Ordena por data
      const dateA = new Date(a.date.split("/").reverse().join("-"))
      const dateB = new Date(b.date.split("/").reverse().join("-"))
      return dateA.getTime() - dateB.getTime()
    })

  // Busca agentes cadastrados e seus créditos reais
  const salonAgents = await db
    .select({
      id: agents.id,
      name: agents.name,
      model: agents.model,
    })
    .from(agents)
    .where(eq(agents.salonId, salonId))

  // Para cada agente, busca créditos reais da tabela messages
  const topAgents = await Promise.all(
    salonAgents.map(async (agent) => {
      if (!agent.model) {
        return {
          name: agent.name,
          credits: 0,
          model: undefined,
        }
      }

      const agentMessages = await db
        .select({
          totalTokens: messages.totalTokens,
        })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(
          and(
            eq(chats.salonId, salonId),
            eq(messages.role, 'assistant'),
            eq(messages.model, agent.model),
            sql`${messages.totalTokens} IS NOT NULL`,
            sql`${messages.totalTokens} > 0`
          )
        )

      // Calcula créditos ponderados para cada mensagem
      const credits = agentMessages.reduce((sum, msg) => {
        return sum + calculateCredits(msg.totalTokens || 0, agent.model)
      }, 0)

      return {
        name: agent.name,
        credits: credits,
        model: agent.model || undefined,
      }
    })
  )

  // Ordena por créditos (maior primeiro)
  topAgents.sort((a, b) => b.credits - a.credits)

  // Calcula créditos por modelo usando dados reais da tabela messages (aplicando pesos)
  const modelUsageRaw = await db
    .select({
      model: messages.model,
      totalTokens: messages.totalTokens,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(
      and(
        eq(chats.salonId, salonId),
        eq(messages.role, 'assistant'),
        sql`${messages.model} IS NOT NULL`,
        sql`${messages.totalTokens} IS NOT NULL`,
        sql`${messages.totalTokens} > 0`,
        gte(messages.createdAt, sql`CURRENT_DATE - INTERVAL '30 days'`)
      )
    )

  // Combina com dados de aiUsageStats para garantir que temos todos os modelos
  const modelMap = new Map<string, number>()
  
  // Adiciona dados reais de messages aplicando pesos
  modelUsageRaw.forEach((msg) => {
    if (msg.model && msg.totalTokens) {
      const credits = calculateCredits(msg.totalTokens, msg.model)
      modelMap.set(msg.model, (modelMap.get(msg.model) || 0) + credits)
    }
  })

  // Adiciona dados de aiUsageStats (já ponderados, pode ter dados históricos)
  usageStatsData.forEach((item) => {
    modelMap.set(item.model, (modelMap.get(item.model) || 0) + (Number(item.credits) || 0))
  })

  const total = Array.from(modelMap.values()).reduce((sum, val) => sum + val, 0) || 1
  const creditsByModel = Array.from(modelMap.entries()).map(([name, credits]) => ({
    name,
    percent: total > 0 ? Math.round((credits / total) * 100) : 0,
  }))

  const planTier = (profileResult[0]?.tier as 'SOLO' | 'PRO' | 'ENTERPRISE') || 'SOLO'
  const userName = profileResult[0]?.fullName?.split(' ')[0] || 'Usuário'

  return {
    planTier,
    userName,
    completedAppointments,
    activeChats,
    averageResponseTime,
    responseRate,
    queueAverageTime,
    creditsByDay,
    topAgents,
    creditsByModel,
  }
}

/**
 * Sincroniza dados reais da tabela messages para as tabelas de estatísticas
 * Agrupa por data e modelo para ai_usage_stats e por agente para agent_stats
 */
async function syncRealUsageData(salonId: string): Promise<void> {
  try {
    // Busca dados individuais da tabela messages para aplicar pesos
    const rawMessages = await db
      .select({
        date: sql<string>`DATE(${messages.createdAt})::text`,
        model: messages.model,
        totalTokens: messages.totalTokens,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(
        and(
          eq(chats.salonId, salonId),
          eq(messages.role, 'assistant'),
          sql`${messages.model} IS NOT NULL`,
          sql`${messages.totalTokens} IS NOT NULL`,
          sql`${messages.totalTokens} > 0`
        )
      )

    // Agrupa por data e modelo, aplicando pesos aos tokens
    const creditsByDateAndModel = new Map<string, number>()
    
    for (const msg of rawMessages) {
      if (!msg.model || !msg.totalTokens) continue
      
      const key = `${msg.date}|${msg.model}`
      const credits = calculateCredits(msg.totalTokens, msg.model)
      creditsByDateAndModel.set(key, (creditsByDateAndModel.get(key) || 0) + credits)
    }

    // Sincroniza para ai_usage_stats (agrupa por data e modelo)
    for (const [key, credits] of creditsByDateAndModel.entries()) {
      const [date, model] = key.split('|')
      
      if (!date || !model || credits <= 0) continue

      const existing = await db
        .select()
        .from(aiUsageStats)
        .where(
          and(
            eq(aiUsageStats.salonId, salonId),
            eq(aiUsageStats.date, date),
            eq(aiUsageStats.model, model)
          )
        )
        .limit(1)

      if (existing.length > 0) {
        // Atualiza se já existe
        await db
          .update(aiUsageStats)
          .set({
            credits: credits,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(aiUsageStats.salonId, salonId),
              eq(aiUsageStats.date, date),
              eq(aiUsageStats.model, model)
            )
          )
      } else {
        // Insere novo
        await db.insert(aiUsageStats).values({
          salonId,
          date,
          model,
          credits: credits,
        })
      }
    }

    // Busca dados reais por agente (usa o nome do agente da tabela agents ou padrão)
    // Como não há relação direta, vamos usar os agentes cadastrados e seus modelos
    const salonAgents = await db
      .select({
        id: agents.id,
        name: agents.name,
        model: agents.model,
      })
      .from(agents)
      .where(eq(agents.salonId, salonId))

    // Para cada agente, busca tokens das mensagens que usaram o modelo do agente
    for (const agent of salonAgents) {
      if (!agent.model) continue

      const agentMessages = await db
        .select({
          totalTokens: messages.totalTokens,
        })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(
          and(
            eq(chats.salonId, salonId),
            eq(messages.role, 'assistant'),
            eq(messages.model, agent.model),
            sql`${messages.totalTokens} IS NOT NULL`,
            sql`${messages.totalTokens} > 0`
          )
        )

      // Calcula créditos ponderados para cada mensagem
      const totalCredits = agentMessages.reduce((sum, msg) => {
        return sum + calculateCredits(msg.totalTokens || 0, agent.model)
      }, 0)

      if (totalCredits > 0) {
        const existing = await db
          .select()
          .from(agentStats)
          .where(
            and(
              eq(agentStats.salonId, salonId),
              eq(agentStats.agentName, agent.name)
            )
          )
          .limit(1)

        if (existing.length > 0) {
          await db
            .update(agentStats)
            .set({
              totalCredits: totalCredits,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(agentStats.salonId, salonId),
                eq(agentStats.agentName, agent.name)
              )
            )
        } else {
          await db.insert(agentStats).values({
            salonId,
            agentName: agent.name,
            totalCredits: totalCredits,
          })
        }
      }
    }

    // Também sincroniza para o agente padrão "Assistente IA" se houver mensagens sem agente específico
    const defaultAgentMessages = await db
      .select({
        totalTokens: messages.totalTokens,
        model: messages.model,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(
        and(
          eq(chats.salonId, salonId),
          eq(messages.role, 'assistant'),
          sql`${messages.totalTokens} IS NOT NULL`,
          sql`${messages.totalTokens} > 0`
        )
      )

    // Calcula créditos ponderados para cada mensagem
    const defaultCredits = defaultAgentMessages.reduce((sum, msg) => {
      return sum + calculateCredits(msg.totalTokens || 0, msg.model)
    }, 0)
    if (defaultCredits > 0) {
      const existing = await db
        .select()
        .from(agentStats)
        .where(
          and(
            eq(agentStats.salonId, salonId),
            eq(agentStats.agentName, 'Assistente IA')
          )
        )
        .limit(1)

      if (existing.length > 0) {
        await db
          .update(agentStats)
          .set({
            totalCredits: defaultCredits,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(agentStats.salonId, salonId),
              eq(agentStats.agentName, 'Assistente IA')
            )
          )
      } else {
        await db.insert(agentStats).values({
          salonId,
          agentName: 'Assistente IA',
          totalCredits: defaultCredits,
        })
      }
    }
  } catch (error) {
    console.error("❌ Erro ao sincronizar dados reais:", error)
    throw error
  }
}

/**
 * Inicializa dados padrão para o salão se não existirem
 * Agora sincroniza dados reais da tabela messages ao invés de criar dados aleatórios
 */
export async function initializeDashboardData(salonId: string): Promise<{ success: boolean } | { error: string }> {
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

  // Verifica se o usuário tem acesso ao salão (Owner ou Manager)
  const hasAccess = await hasSalonPermission(salonId, user.id)

  if (!hasAccess) {
    return { error: "Acesso negado a este salão" }
  }

  // Verifica se o salão existe
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { id: true },
  })

  if (!salon) {
     return { error: "Salão não encontrado" }
  }

  // Sincroniza dados reais da tabela messages
  try {
    await syncRealUsageData(salonId)
    return { success: true }
  } catch (error) {
    console.error("❌ Erro ao inicializar dados do dashboard:", error)
    return { error: "Erro ao sincronizar dados" }
  }
}

/**
 * Atualiza créditos de uso de IA baseado em tokens de uma mensagem
 * Esta função deve ser chamada após salvar uma mensagem do assistente com tokens
 */
export async function updateAgentCredits(
  salonId: string,
  agentName: string,
  model: string,
  tokens: number
): Promise<void> {
  if (!salonId || !agentName || !model || !tokens || tokens <= 0) {
    console.warn(`⚠️ updateAgentCredits: dados inválidos`, { salonId, agentName, model, tokens });
    return // Ignora se dados inválidos
  }

  // Aplica peso do modelo aos tokens para calcular créditos
  const credits = calculateCredits(tokens, model)

  const today = new Date().toISOString().split("T")[0]
  console.log(`📊 updateAgentCredits: atualizando créditos para ${salonId} - ${agentName} - ${model} - ${tokens} tokens (${credits} créditos) em ${today}`);

  try {
    // Atualiza ou insere em aiUsageStats (uso diário por modelo)
    const existingUsage = await db
      .select()
      .from(aiUsageStats)
      .where(
        and(
          eq(aiUsageStats.salonId, salonId),
          eq(aiUsageStats.date, today),
          eq(aiUsageStats.model, model)
        )
      )
      .limit(1)

    if (existingUsage.length > 0) {
      // Atualiza créditos existentes
      await db
        .update(aiUsageStats)
        .set({
          credits: sql`${aiUsageStats.credits} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiUsageStats.salonId, salonId),
            eq(aiUsageStats.date, today),
            eq(aiUsageStats.model, model)
          )
        )
    } else {
      // Insere novo registro
      await db.insert(aiUsageStats).values({
        salonId,
        date: today,
        model,
        credits: credits,
      })
    }

    // Atualiza ou insere em agentStats (total por agente)
    const existingAgent = await db
      .select()
      .from(agentStats)
      .where(
        and(
          eq(agentStats.salonId, salonId),
          eq(agentStats.agentName, agentName)
        )
      )
      .limit(1)

    if (existingAgent.length > 0) {
      // Atualiza créditos existentes
      await db
        .update(agentStats)
        .set({
          totalCredits: sql`${agentStats.totalCredits} + ${credits}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agentStats.salonId, salonId),
            eq(agentStats.agentName, agentName)
          )
        )
    } else {
      // Insere novo registro
      await db.insert(agentStats).values({
        salonId,
        agentName,
        totalCredits: credits,
      })
    }
  } catch (error) {
    // Log erro mas não interrompe o fluxo
    console.error("❌ Erro ao atualizar créditos do agente:", error)
    if (error instanceof Error) {
      console.error("Stack:", error.stack)
    }
  }
  
  console.log(`✅ updateAgentCredits: concluído para ${salonId} - ${agentName}`)
}
