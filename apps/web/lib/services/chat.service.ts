/**
 * Serviço para operações relacionadas a chats e mensagens
 */

import { db, chats, messages, salons, profiles, customers, and, asc, desc, eq, sql } from "@repo/db"
import type { ChatMessage } from "../types/chat"
import { logger } from "../logger"

/**
 * Encontra ou cria um customer na tabela customers
 * Se não existir, cria com nome baseado no telefone formatado
 * 
 * PROTEGIDO CONTRA RACE CONDITIONS:
 * - Usa INSERT ... ON CONFLICT DO NOTHING para evitar duplicatas
 * - Busca novamente após insert para garantir retorno consistente
 */
export async function findOrCreateCustomer(
  clientPhone: string,
  salonId: string,
  profileName?: string | null
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

  // Se não existir, tenta criar com proteção contra race condition
  if (!customer) {
    // Usa o nome do perfil do WhatsApp se disponível e válido
    // Se não, usa fallback para "Novo Cliente" com DDD entre parênteses
    const validProfileName = profileName && profileName.trim().length > 0 ? profileName.trim() : null;

    const customerName = validProfileName
      || (normalizedPhone.length >= 10
        ? `Novo Cliente (${normalizedPhone.slice(0, 2)})`
        : "Novo Cliente")

    try {
      // Usa INSERT ... ON CONFLICT DO NOTHING para evitar erro de duplicata
      // Se outra requisição criou o customer entre o SELECT e o INSERT, isso não vai falhar
      await db.insert(customers).values({
        salonId,
        name: customerName,
        phone: normalizedPhone,
      }).onConflictDoNothing({
        target: [customers.salonId, customers.phone]
      })

      // Busca novamente para pegar o ID (seja do insert ou do existente)
      customer = await db.query.customers.findFirst({
        where: and(
          eq(customers.salonId, salonId),
          eq(customers.phone, normalizedPhone)
        ),
        columns: { id: true, name: true }
      })

      if (!customer) {
        // Se ainda não encontrou, algo está muito errado
        throw new Error("Falha ao criar ou encontrar customer após insert")
      }
    } catch (error) {
      // Se for erro de constraint única, busca o registro existente
      if (error instanceof Error && error.message.includes("unique")) {
        logger.warn({ normalizedPhone, salonId }, "Race condition detected on customer creation, fetching existing")

        customer = await db.query.customers.findFirst({
          where: and(
            eq(customers.salonId, salonId),
            eq(customers.phone, normalizedPhone)
          ),
          columns: { id: true, name: true }
        })

        if (!customer) {
          throw new Error("Falha ao criar customer: constraint violation mas registro não encontrado")
        }
      } else {
        throw error
      }
    }
  }

  // Se existir (ou acabou de ser criado/encontrado), verifica se precisa atualizar o nome (Auto-Healing)
  // Só atualiza se tiver um nome de perfil válido vindo do WhatsApp
  if (customer && profileName && profileName.trim().length > 0) {
    const newName = profileName.trim();

    // Remove caracteres não alfanuméricos do nome atual para comparação
    const currentNameClean = customer.name.replace(/[^a-zA-Z0-9]/g, "")

    // Verifica se o nome atual é "genérico"
    // 1. Só números (ex: "551199999999")
    // 2. Contém "Novo Cliente"
    // 3. Contém "Cliente" seguido de números (ex: "Cliente 1234")
    const isGenericName =
      /^\d+$/.test(currentNameClean) ||
      customer.name.includes("Novo Cliente") ||
      /Cliente\s*\d+/.test(customer.name);

    // Se o nome atual for genérico E o novo nome tiver letras (não for só número)
    // E o novo nome for diferente do atual
    if (isGenericName && /[a-zA-Z]/.test(newName) && customer.name !== newName) {
      try {
        await db.update(customers)
          .set({ name: newName, updatedAt: new Date() })
          .where(eq(customers.id, customer.id))

        logger.info({ customerId: customer.id, oldName: customer.name, newName }, "Auto-updated generic customer name to pushName");

        // Atualiza objeto local para retorno
        customer.name = newName
      } catch (error) {
        // Loga erro mas não falha a operação principal
        logger.warn({ error, customerId: customer.id, newName }, "Failed to auto-update customer name")
      }
    }
  }

  return { id: customer.id, name: customer.name }
}

/**
 * Encontra ou cria um chat ativo para um cliente
 * 
 * PROTEGIDO CONTRA RACE CONDITIONS:
 * - Usa INSERT ... ON CONFLICT para evitar duplicatas
 * - Busca novamente após insert para garantir retorno consistente
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
    try {
      // Usa INSERT ... ON CONFLICT DO NOTHING para evitar erro de duplicata
      await db
        .insert(chats)
        .values({
          salonId,
          clientPhone,
          status: "active",
        })
        .onConflictDoNothing({
          target: [chats.salonId, chats.clientPhone]
        })

      // Busca novamente para pegar o ID (seja do insert ou do existente)
      chat = await db.query.chats.findFirst({
        where: and(
          eq(chats.clientPhone, clientPhone),
          eq(chats.salonId, salonId),
          eq(chats.status, "active")
        ),
      })

      if (!chat) {
        // Se ainda não encontrou, algo está errado
        throw new Error("Falha ao criar ou encontrar chat após insert")
      }
    } catch (error) {
      // Se for erro de constraint única, busca o registro existente
      if (error instanceof Error && error.message.includes("unique")) {
        logger.warn({ clientPhone, salonId }, "Race condition detected on chat creation, fetching existing")

        chat = await db.query.chats.findFirst({
          where: and(
            eq(chats.clientPhone, clientPhone),
            eq(chats.salonId, salonId),
            eq(chats.status, "active")
          ),
        })

        if (!chat) {
          throw new Error("Falha ao criar chat: constraint violation mas registro não encontrado")
        }
      } else {
        throw error
      }
    }
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

  // Para web chat, não temos pushName, então passamos null
  return findOrCreateCustomer(clientPhone, salonId, null)
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

