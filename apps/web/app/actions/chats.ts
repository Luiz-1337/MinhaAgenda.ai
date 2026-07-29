"use server"

import { db, chats, messages, customers, chatKanbanColumns, salons, and, asc, desc, eq, inArray } from "@repo/db"
import { revalidatePath } from "next/cache"
import { getSessionUserId } from "@/lib/supabase/auth"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import { AI_RESUME_MIN_MINUTES, AI_RESUME_MAX_MINUTES } from "@/lib/services/chat/manual-mode"
import { formatPhoneBR } from "@/lib/utils/phone.utils"
import { formatPreviewTime } from "@/lib/utils/time.utils"
import { sendProactiveMessage } from "@/lib/services/messaging/proactive"
import { saveMessage } from "@/lib/services/chat.service"
import { getWhatsappMediaSignedUrl } from "@/lib/supabase/storage"

export interface ChatConversation {
  id: string
  customer: {
    name: string
    phone: string
  }
  lastMessageAt: string
  preview: string
  status: "Ativo" | "Finalizado" | "Aguardando humano"
  assignedTo: string
  isManual: boolean
  kanbanColumnId: string | null
  kanbanColumnName: string | null
  kanbanColumnColor: string | null
  customerTags: { id: string; name: string; color: string }[]
}

export interface ChatMessage {
  id: string
  from: "cliente" | "agente"
  text: string
  time: string
  /** Status de entrega (só para mensagens do agente): 'sent'|'retrying'|'delivered'|'failed'|'undelivered'. */
  deliveryStatus?: string | null
  /** Tipo da mídia recebida do cliente ('image' | 'audio' | ...), se houver. */
  mediaType?: string | null
  /** URL assinada (temporária) da mídia no Storage; null enquanto o worker ainda processa. */
  mediaUrl?: string | null
}

/**
 * Formata data para exibição
 */
function formatMessageTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Agora"
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays}d`

  // Formato completo para datas mais antigas
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

/**
 * Autorização por SALÃO. Estar logado não basta: o salonId chega do cliente, e
 * sem escopo qualquer usuário autenticado leria (e escreveria) dados de outro
 * salão passando o id dele.
 */
async function authorizeSalon(salonId: string): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }
  if (!(await hasSalonPermission(salonId, userId))) {
    return { error: "Sem permissão para este salão" }
  }
  return { userId }
}

/**
 * Autorização a partir do CHAT: resolve o salão dono do chat e valida a permissão
 * nele. As actions que recebem só `chatId` não têm como se escopar sem este
 * passo — e uma delas envia WhatsApp pelo número do salão.
 *
 * Devolve o salonId resolvido para o chamador não precisar reconsultar.
 */
async function authorizeChat(
  chatId: string
): Promise<{ salonId: string } | { error: string }> {
  if (!chatId) return { error: "chatId é obrigatório" }
  const userId = await getSessionUserId()
  if (!userId) return { error: "Não autenticado" }

  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    columns: { salonId: true },
  })
  // Mensagem única para chat inexistente e chat de outro salão: distinguir os
  // dois contaria a um estranho que aquele id existe.
  if (!chat || !(await hasSalonPermission(chat.salonId, userId))) {
    return { error: "Conversa não encontrada" }
  }
  return { salonId: chat.salonId }
}

/**
 * Busca todas as conversas (chats) de um salão
 */
export async function getChatConversations(salonId: string): Promise<ChatConversation[] | { error: string }> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  try {
    // Busca todos os chats do salão
    const salonChats = await db.query.chats.findMany({
      where: eq(chats.salonId, salonId),
      orderBy: desc(chats.updatedAt),
      limit: 100,
    })

    // Busca a última mensagem de cada chat para o preview
    const chatIds = salonChats.map((chat) => chat.id)
    const lastMessageByChat = new Map<string, typeof messages.$inferSelect>()

    if (chatIds.length > 0) {
      // Busca mensagens de todos os chats do salão
      const allMessages = await db.query.messages.findMany({
        where: inArray(messages.chatId, chatIds),
        orderBy: desc(messages.createdAt),
        limit: 1000, // Limite alto para garantir que pegamos as últimas de cada chat
      })

      // Agrupa mensagens por chat e pega a última de cada
      for (const msg of allMessages) {
        if (!lastMessageByChat.has(msg.chatId)) {
          lastMessageByChat.set(msg.chatId, msg)
        }
      }
    }

    // Busca colunas kanban do salão para enriquecer cada chat com nome/cor
    const kanbanCols = await db.query.chatKanbanColumns.findMany({
      where: eq(chatKanbanColumns.salonId, salonId),
      orderBy: asc(chatKanbanColumns.position),
      columns: { id: true, name: true, color: true, isDefault: true }
    })
    const kanbanById = new Map<string, { name: string; color: string }>()
    for (const col of kanbanCols) kanbanById.set(col.id, { name: col.name, color: col.color })
    const defaultKanban = kanbanCols.find((c) => c.isDefault)

    // Busca nomes dos clientes WhatsApp pela tabela customers
    const phoneNumbers = salonChats.map((chat) => chat.clientPhone.replace(/\D/g, ""))
    const customerByPhone = new Map<
      string,
      { id: string; name: string; phone: string; tags: { id: string; name: string; color: string }[] }
    >()

    if (phoneNumbers.length > 0) {
      const salonCustomers = await db.query.customers.findMany({
        where: and(
          eq(customers.salonId, salonId),
          inArray(customers.phone, phoneNumbers)
        ),
        columns: {
          id: true,
          name: true,
          phone: true,
        },
        with: { tagAssignments: { with: { tag: true } } },
      })

      for (const customer of salonCustomers) {
        customerByPhone.set(customer.phone, {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          tags: customer.tagAssignments
            .slice()
            .sort((a, b) => a.tag.position - b.tag.position)
            .map((a) => ({ id: a.tag.id, name: a.tag.name, color: a.tag.color })),
        })
      }
    }

    // Monta as conversas - FILTRA apenas chats que têm mensagens
    const conversations: ChatConversation[] = salonChats
      .filter((chat) => lastMessageByChat.has(chat.id)) // Só mostra chats com mensagens
      .map((chat) => {
        const normalizedPhone = chat.clientPhone.replace(/\D/g, "")
        const customer = customerByPhone.get(normalizedPhone)
        const lastMessage = lastMessageByChat.get(chat.id)!

        // Formata telefone para exibição (tira DDI 55; trata 13 dígitos do WhatsApp)
        const formattedPhone = formatPhoneBR(normalizedPhone) || chat.clientPhone

        const effectiveColumnId = chat.kanbanColumnId && kanbanById.has(chat.kanbanColumnId)
          ? chat.kanbanColumnId
          : defaultKanban?.id ?? null
        const effectiveColumn = effectiveColumnId ? kanbanById.get(effectiveColumnId) : undefined

        return {
          id: chat.id,
          customer: {
            name: customer?.name || formattedPhone,
            phone: formattedPhone,
          },
          lastMessageAt: formatPreviewTime(lastMessage.createdAt),
          preview: lastMessage.content?.substring(0, 50) || "Sem mensagens",
          status: (chat.status === "active" ? "Ativo" : "Finalizado") as "Ativo" | "Finalizado" | "Aguardando humano",
          assignedTo: "IA Assistente",
          isManual: chat.isManual || false,
          kanbanColumnId: effectiveColumnId,
          kanbanColumnName: effectiveColumn?.name ?? null,
          kanbanColumnColor: effectiveColumn?.color ?? null,
          customerTags: customer?.tags ?? [],
        }
      })

    return conversations
  } catch (error) {
    console.error("Erro ao buscar conversas:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Busca mensagens de um chat específico
 */
export async function getChatMessages(chatId: string): Promise<ChatMessage[] | { error: string }> {
  const auth = await authorizeChat(chatId)
  if ("error" in auth) return auth

  try {
    // Busca todas as mensagens do chat (exceto system)
    const allChatMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, chatId),
      orderBy: desc(messages.createdAt),
      limit: 100,
    })

    // Filtra apenas user e assistant (remove system) e mensagens vazias
    const validMessages = allChatMessages.filter(
      (msg) =>
        (msg.role === "user" || msg.role === "assistant") &&
        msg.content &&
        msg.content.trim().length > 0
    )

    // Reverte para ordem cronológica (mais antiga primeiro)
    const chatMessagesList: ChatMessage[] = await Promise.all(
      validMessages
        .reverse()
        .map(async (msg) => ({
          id: msg.id,
          from: (msg.role === "user" ? "cliente" : "agente") as "cliente" | "agente",
          text: msg.content || "",
          time: formatMessageTime(msg.createdAt),
          deliveryStatus: msg.role === "assistant" ? msg.deliveryStatus : undefined,
          mediaType: msg.mediaType ?? null,
          mediaUrl: msg.mediaPath ? await getWhatsappMediaSignedUrl(msg.mediaPath) : null,
        }))
    )

    return chatMessagesList
  } catch (error) {
    console.error("Erro ao buscar mensagens:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Atualiza o modo manual de um chat
 */
export async function setChatManualMode(
  chatId: string,
  isManual: boolean
): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeChat(chatId)
  if ("error" in auth) return auth

  try {
    const now = new Date()
    await db
      .update(chats)
      .set({
        isManual,
        // Assumir manualmente arma o relógio da retomada automática; devolver
        // para a IA tem que LIMPAR os dois campos, senão o chat volta como
        // automático mas carregando a data e o motivo de uma virada antiga.
        manualSince: isManual ? now : null,
        manualReason: isManual ? "panel" : null,
        updatedAt: now
      })
      .where(eq(chats.id, chatId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar modo manual do chat:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Política de retomada automática da IA, por salão.
 *
 * `null` = nunca retomar sozinho — só o botão "Passar para a IA" devolve a
 * conversa. É o comportamento histórico e o default de todo salão.
 */
export async function getAIResumePolicy(
  salonId: string
): Promise<{ minutes: number | null } | { error: string }> {
  const auth = await authorizeSalon(salonId)
  if ("error" in auth) return auth

  try {
    const row = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { aiResumeAfterMinutes: true }
    })
    return { minutes: row?.aiResumeAfterMinutes ?? null }
  } catch (error) {
    console.error("Erro ao buscar política de retomada da IA:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function setAIResumePolicy(input: {
  salonId: string
  /** Minutos de silêncio do humano até a IA reassumir. null desliga a retomada. */
  minutes: number | null
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeSalon(input.salonId)
  if ("error" in auth) return auth

  // Valida ANTES de bater no banco: o CHECK da migration 024 rejeitaria fora da
  // faixa, mas com erro de Postgres cru na cara do dono.
  if (input.minutes !== null) {
    if (!Number.isInteger(input.minutes)) {
      return { error: "Informe o tempo em minutos inteiros." }
    }
    if (input.minutes < AI_RESUME_MIN_MINUTES || input.minutes > AI_RESUME_MAX_MINUTES) {
      return {
        error: `O tempo precisa ficar entre ${AI_RESUME_MIN_MINUTES} minutos e ${AI_RESUME_MAX_MINUTES / 1440} dias.`
      }
    }
  }

  try {
    await db
      .update(salons)
      .set({ aiResumeAfterMinutes: input.minutes, updatedAt: new Date() })
      .where(eq(salons.id, input.salonId))
    revalidatePath(`/${input.salonId}/settings`)
    return { success: true }
  } catch (error) {
    console.error("Erro ao salvar política de retomada da IA:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Envia uma mensagem manual do humano via WhatsApp
 */
export async function sendManualMessage(
  chatId: string,
  content: string
): Promise<{ success: true } | { error: string }> {
  if (!content.trim()) {
    return { error: "content é obrigatório" }
  }

  // Escopo por salão ANTES de qualquer coisa: esta action envia WhatsApp pelo
  // número do salão, então sem ela um usuário de outro salão poderia falar com os
  // clientes deste se passando por ele.
  const auth = await authorizeChat(chatId)
  if ("error" in auth) return auth

  try {
    // Busca o chat para obter o clientPhone e salonId
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: {
        id: true,
        clientPhone: true,
        salonId: true,
        isManual: true,
      },
    })

    if (!chat) {
      return { error: "Conversa não encontrada" }
    }

    if (!chat.isManual) {
      return { error: "Chat não está em modo manual" }
    }

    // Salva a mensagem como assistant (mensagem do agente humano). fromHuman a
    // separa das falas da IA dentro do mesmo role.
    await saveMessage(chat.id, "assistant", content.trim(), { fromHuman: true })

    // Envia via WhatsApp pelo provider do salão. Envio manual está num chat
    // ativo (geralmente dentro da janela de 24h) -> passa chatId para a checagem.
    await sendProactiveMessage({ salonId: chat.salonId, to: chat.clientPhone, text: content.trim(), chatId: chat.id })

    // Refresca o relógio da retomada: o dono acabou de falar, então a IA só deve
    // reassumir contando a partir de AGORA — igual ao eco vindo do celular.
    await db
      .update(chats)
      .set({ manualSince: new Date(), updatedAt: new Date() })
      .where(eq(chats.id, chatId))

    return { success: true }
  } catch (error) {
    console.error("Erro ao enviar mensagem manual:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

/**
 * Busca o risco de No-Show para o cliente do chat
 */
export async function getNoShowRiskForChat(chatId: string): Promise<{ isHighRisk: boolean } | { error: string }> {
  const auth = await authorizeChat(chatId)
  if ("error" in auth) return auth

  try {
    // Busca phone e salon
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { clientPhone: true, salonId: true }
    });

    if (!chat || !chat.clientPhone) return { isHighRisk: false };

    // Busca cliente na tabela customers (não profiles)
    const customer = await db.query.customers.findFirst({
      where: and(
        eq(customers.salonId, chat.salonId),
        eq(customers.phone, chat.clientPhone.replace(/\D/g, ""))
      ),
      columns: { id: true }
    })

    if (!customer) return { isHighRisk: false };

    const { evaluateNoShowRisk } = await import("@repo/db/src/services/no-show-predictor.service");
    const risk = await evaluateNoShowRisk(customer.id, chat.salonId);

    return { isHighRisk: risk.isHighRisk };
  } catch (err) {
    console.error("Erro ao avaliar risco para o chat:", err);
    return { isHighRisk: false };
  }
}

