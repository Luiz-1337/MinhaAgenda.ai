/**
 * Serviço para operações relacionadas a chats e mensagens
 */

import { and, asc, desc, eq } from "drizzle-orm"
import { db, chats, messages, salons, chatMessages, profiles, customers } from "@repo/db"
import type { ChatMessage } from "@/lib/types/chat"

/**
 * Encontra ou cria um customer na tabela customers
 * Se não existir, cria com nome baseado no telefone formatado
 */
export async function findOrCreateCustomer(
  clientPhone: string,
  salonId: string
): Promise<{ id: string; name: string }> {
  // Normaliza telefone (remove caracteres não numéricos)
  // clientPhone vem no formato E.164 (ex: +5511986049295)
  const normalizedPhone = clientPhone.replace(/\D/g, "")
  
  // Busca customer existente
  let customer = await db.query.customers.findFirst({
    where: and(
      eq(customers.salonId, salonId),
      eq(customers.phone, normalizedPhone)
    ),
    columns: { id: true, name: true }
  })
  
  // Se não existir, cria com nome baseado no telefone formatado
  if (!customer) {
    // Formata telefone para exibição (mesmo padrão usado em getChatConversations)
    const formattedName = normalizedPhone.length === 11
      ? `(${normalizedPhone.slice(0, 2)}) ${normalizedPhone.slice(2, 7)}-${normalizedPhone.slice(7)}`
      : clientPhone
    
    const [newCustomer] = await db.insert(customers).values({
      salonId,
      name: formattedName,
      phone: normalizedPhone,
    }).returning({ id: customers.id, name: customers.name })
    
    if (!newCustomer) {
      throw new Error("Falha ao criar customer")
    }
    
    customer = newCustomer
  }
  
  return { id: customer.id, name: customer.name }
}

/**
 * Encontra ou cria um chat ativo para um cliente
 */
export async function findOrCreateChat(
  clientPhone: string,
  salonId: string
): Promise<{ id: string }> {
  // Busca chat existente
  let chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.clientPhone, clientPhone),
      eq(chats.salonId, salonId),
      eq(chats.status, "active")
    ),
  })

  // Cria novo chat se não existir
  if (!chat) {
    const inserted = await db
      .insert(chats)
      .values({
        salonId,
        clientPhone,
        status: "active",
      })
      .returning({ id: chats.id })

    if (!inserted[0]) {
      throw new Error("Falha ao criar chat")
    }

    const newChat = await db.query.chats.findFirst({
      where: eq(chats.id, inserted[0].id),
    })

    if (!newChat) {
      throw new Error("Falha ao recuperar chat criado")
    }

    chat = newChat
  }

  return { id: chat.id }
}

/**
 * Encontra ou cria um chat ativo para um usuário web (baseado em clientId)
 * Usa o telefone do perfil se disponível, caso contrário usa um identificador único
 */
export async function findOrCreateWebChat(
  clientId: string,
  salonId: string
): Promise<{ id: string }> {
  // Busca o telefone do perfil do usuário
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, clientId),
    columns: { phone: true },
  })

  // Usa o telefone do perfil se disponível, caso contrário usa um identificador único baseado no clientId
  const clientPhone = profile?.phone || `web-${clientId}`

  return findOrCreateChat(clientPhone, salonId)
}

/**
 * Salva uma mensagem no banco de dados (tabela messages)
 */
export async function saveMessage(
  chatId: string,
  role: "user" | "assistant" | "system",
  content: string,
  options?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    model?: string
    requiresResponse?: boolean
  }
): Promise<void> {
  await db.insert(messages).values({
    chatId,
    role,
    content,
    requiresResponse: options?.requiresResponse ?? false,
    inputTokens: options?.inputTokens ?? null,
    outputTokens: options?.outputTokens ?? null,
    totalTokens: options?.totalTokens ?? null,
    model: options?.model ?? null,
  })

  if (role === "assistant") {
    await db
      .update(chats)
      .set({
        lastBotMessageRequiresResponse: options?.requiresResponse ?? false,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId))
  }

  if (role === "user") {
    await db
      .update(chats)
      .set({
        lastBotMessageRequiresResponse: false,
        updatedAt: new Date(),
      })
      .where(eq(chats.id, chatId))
  }
}

/**
 * Atualiza timestamps do chat para cálculo de tempo de resposta
 */
export async function updateChatTimestamps(
  chatId: string,
  role: "user" | "assistant"
): Promise<void> {
  const now = new Date()
  
  if (role === "user") {
    // Atualiza first_user_message_at apenas se ainda não foi definido
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { firstUserMessageAt: true },
    })
    
    if (!chat?.firstUserMessageAt) {
      await db
        .update(chats)
        .set({ firstUserMessageAt: now })
        .where(eq(chats.id, chatId))
    }
  } else if (role === "assistant") {
    // Atualiza first_agent_response_at apenas se ainda não foi definido
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { firstAgentResponseAt: true },
    })
    
    if (!chat?.firstAgentResponseAt) {
      await db
        .update(chats)
        .set({ firstAgentResponseAt: now })
        .where(eq(chats.id, chatId))
    }
  }
}

/**
 * Salva uma mensagem na tabela chatMessages (relacionada a salonId e clientId)
 */
export async function saveChatMessage(
  salonId: string,
  clientPhone: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  // Busca o profileId pelo telefone (pode ser null se o cliente não existir)
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.phone, clientPhone),
    columns: { id: true },
  })

  const clientId = profile?.id || null

  await db.insert(chatMessages).values({
    salonId,
    clientId,
    role,
    content,
  })
}

/**
 * Obtém o histórico de mensagens de um chat
 */
export async function getChatHistory(chatId: string, limit = 10): Promise<ChatMessage[]> {
  // Importante: queremos as mensagens MAIS RECENTES, mas retornadas em ordem cronológica (asc)
  const latestMessages = await db.query.messages.findMany({
    where: eq(messages.chatId, chatId),
    orderBy: desc(messages.createdAt),
    limit,
  })

  // Reverte para ficar do mais antigo -> mais novo dentro do recorte
  return latestMessages.reverse().map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content || "",
  }))
}

/**
 * Obtém o nome do salão
 */
export async function getSalonName(salonId: string): Promise<string> {
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { name: true },
  })

  return salon?.name || "Salão"
}

