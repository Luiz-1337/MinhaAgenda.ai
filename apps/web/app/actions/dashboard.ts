"use server"

import { createClient } from "@/lib/supabase/server"
import { db, appointments, chats, aiUsageStats, agentStats, salons, profiles, sql, messages, agents, eq, and, gte, desc, asc, inArray, count } from "@repo/db"

import { hasSalonPermission } from "@/lib/services/permissions.service"
import { calculateCredits } from "@/lib/utils/credits"
import { startOfMonthBrazil } from "@/lib/utils/timezone.utils"

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

  // Autoriza ANTES de consultar. A versão anterior decidia o acesso só DEPOIS do
  // Promise.all: as oito queries já tinham rodado contra o salonId que veio do
  // cliente, e apenas o resultado era descartado.
  //
  // hasSalonPermission no lugar de comparar salons.ownerId: a action irmã
  // initializeDashboardData já aceitava MANAGER, então gerente e dono viam coisas
  // diferentes na mesma tela. Ela também cobre "salão não existe".
  if (!(await hasSalonPermission(salonId, user.id))) {
    return { error: "Acesso negado a este salão" }
  }

  // Início do mês em Brasília: appointments.date é timestamp SEM timezone
  // guardando UTC, então cortar por mês sem converter joga as noites (21h-24h)
  // do último dia para o mês seguinte.
  const monthStart = startOfMonthBrazil(new Date())

  const [
    profileResult,
    completedAppointmentsResult,
    activeChatsResult,
    messagesResult,
    activeChatRows,
    creditsData,
    usageStatsData,
  ] = await Promise.all([
    db.select({ tier: profiles.tier, fullName: profiles.fullName, firstName: profiles.firstName, email: profiles.email }).from(salons).innerJoin(profiles, eq(salons.ownerId, profiles.id)).where(eq(salons.id, salonId)).limit(1),
    // Atendimentos realizados no mês corrente.
    //
    // Antes isto contava `chats` com status 'completed' — valor que NENHUM código
    // de produto grava (o único writer do repo está em __tests__/eval/runner/seed.ts).
    // O card "Atendimentos Concluídos" exibia 0 em todos os salões e continuaria
    // exibindo 0 para sempre. Agora lê a fonte certa: `appointments`. Segue em 0
    // enquanto nada gravar 'completed' ali, e passa a contar sozinho quando o
    // desfecho de atendimento existir — sem precisar de um segundo deploy.
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.salonId, salonId),
          eq(appointments.status, "completed"),
          gte(appointments.date, monthStart)
        )
      ),
    db
      .select({ n: count() })
      .from(chats)
      .where(and(eq(chats.salonId, salonId), eq(chats.status, "active"))),
    db.select({
      createdAt: messages.createdAt,
      role: messages.role,
    })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(eq(chats.salonId, salonId))
      .orderBy(desc(messages.createdAt))
      .limit(1000),
    // Chats ativos para o cálculo de fila. Estas três leituras eram as últimas da
    // aplicação a passar pelo client Supabase (PostgREST, chave anon/publishable),
    // e por isso `chats` seguia fora do lockdown de RLS do 014, com policy
    // USING(true) para `authenticated`. Em Drizzle, a policy pode fechar.
    db
      .select({ id: chats.id, createdAt: chats.createdAt })
      .from(chats)
      .where(and(eq(chats.salonId, salonId), eq(chats.status, "active")))
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

  const completedAppointments = completedAppointmentsResult[0]?.n ?? 0
  const activeChats = activeChatsResult[0]?.n ?? 0

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
  if (messagesResult && messagesResult.length > 0) {
    const messages = messagesResult
    const userMessages = messages.filter(m => m.role === "user").length
    const assistantMessages = messages.filter(m => m.role === "assistant").length
    responseRate = userMessages > 0 ? Math.round((assistantMessages / userMessages) * 100) : 0
  }

  // Calcula fila média usando uma query SQL eficiente (evita loop com await)
  let queueAverageTime = "0m"
  if (activeChatRows.length > 0) {
    // Busca primeira mensagem de cada chat em uma única query
    const chatIds = activeChatRows.map(c => c.id)
    const firstMessagesData = await db
      .select({
        createdAt: messages.createdAt,
        chatId: messages.chatId,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(
        and(
          eq(chats.salonId, salonId),
          inArray(chats.id, chatIds)
        )
      )
      .orderBy(asc(messages.createdAt))
      .limit(chatIds.length * 5) // Aumentando o limite para garantir que pegamos as primeiras mensagens

    // Agrupa por chat e pega a primeira mensagem de cada
    const messagesByChat = new Map<string, Date>()
    for (const msg of firstMessagesData) {
      // Como estamos ordenando por createdAt ASC, a primeira vez que encontramos um chatId é a mensagem mais antiga
      if (msg.chatId && !messagesByChat.has(msg.chatId)) {
        messagesByChat.set(msg.chatId, new Date(msg.createdAt))
      }
    }

    let totalQueueTime = 0
    let queueCount = 0

    for (const chat of activeChatRows) {
      // Encontra a primeira mensagem correspondente pelo chatId
      const firstMessageTime = messagesByChat.get(chat.id)
      if (firstMessageTime) {
        const timeDiff = firstMessageTime.getTime() - new Date(chat.createdAt).getTime()
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
  const profile = profileResult[0]
  const userName = profile?.firstName
    || profile?.fullName?.split(' ')[0]
    || profile?.email?.split('@')[0]
    || 'Usuário'

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

// syncRealUsageData, initializeDashboardData e updateAgentCredits foram REMOVIDAS.
//
// - syncRealUsageData: recalculava as tabelas de estatistica a cada abertura do
//   dashboard (via after()), varrendo TODAS as mensagens do salao sem filtro de
//   data e fazendo 1 SELECT + 1 UPSERT sequenciais por par (dia, modelo). Uma
//   versao que agrega no SQL ja existia orfa em lib/services/stats-sync.service.ts;
//   agora ela e chamada pelo cron /api/cron/stats-sync.
// - initializeDashboardData: nao inicializava nada — era auth + wrapper do acima.
// - updateAgentCredits: exportada e sem NENHUM chamador. Quem grava credito ao vivo
//   e debitSalonCredits (credits.service.ts), chamada pelo worker.
