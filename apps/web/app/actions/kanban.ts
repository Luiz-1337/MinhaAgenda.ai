"use server"

import {
  db,
  chats,
  messages,
  customers,
  chatKanbanColumns,
  salons,
  and,
  asc,
  desc,
  eq,
  inArray,
  sql
} from "@repo/db"
import { createClient } from "@/lib/supabase/server"
import { hasSalonPermission } from "@/lib/services/permissions.service"
import type { KanbanBoardDTO, KanbanColumnDTO, KanbanChatCard } from "@/lib/types/kanban"

function formatPreviewTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 60) return `${Math.max(diffMins, 0)}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays === 1) return "Ontem"
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  return digits.length === 11
    ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : raw
}

async function authorize(salonId: string): Promise<{ userId: string } | { error: string }> {
  if (!salonId) return { error: "salonId é obrigatório" }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Não autenticado" }
  const allowed = await hasSalonPermission(salonId, user.id)
  if (!allowed) return { error: "Sem permissão neste salão" }
  return { userId: user.id }
}

async function authorizeByColumn(columnId: string): Promise<{ userId: string; salonId: string } | { error: string }> {
  if (!columnId) return { error: "columnId é obrigatório" }
  const column = await db.query.chatKanbanColumns.findFirst({
    where: eq(chatKanbanColumns.id, columnId),
    columns: { salonId: true }
  })
  if (!column) return { error: "Coluna não encontrada" }
  const auth = await authorize(column.salonId)
  if ("error" in auth) return auth
  return { userId: auth.userId, salonId: column.salonId }
}

async function authorizeByChat(chatId: string): Promise<{ userId: string; salonId: string } | { error: string }> {
  if (!chatId) return { error: "chatId é obrigatório" }
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    columns: { salonId: true }
  })
  if (!chat) return { error: "Chat não encontrado" }
  const auth = await authorize(chat.salonId)
  if ("error" in auth) return auth
  return { userId: auth.userId, salonId: chat.salonId }
}

export async function listKanbanColumns(salonId: string): Promise<KanbanColumnDTO[] | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  try {
    const rows = await db.query.chatKanbanColumns.findMany({
      where: eq(chatKanbanColumns.salonId, salonId),
      orderBy: asc(chatKanbanColumns.position)
    })
    return rows.map((r) => ({
      id: r.id,
      salonId: r.salonId,
      name: r.name,
      color: r.color,
      position: r.position,
      isDefault: r.isDefault,
      isSystem: r.isSystem
    }))
  } catch (error) {
    console.error("Erro ao listar colunas kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function listKanbanBoard(salonId: string): Promise<KanbanBoardDTO | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  try {
    const columns = await db.query.chatKanbanColumns.findMany({
      where: eq(chatKanbanColumns.salonId, salonId),
      orderBy: asc(chatKanbanColumns.position)
    })

    const salonChats = await db.query.chats.findMany({
      where: eq(chats.salonId, salonId),
      orderBy: desc(chats.updatedAt),
      limit: 500
    })

    const chatIds = salonChats.map((c) => c.id)
    const lastMessageByChat = new Map<string, typeof messages.$inferSelect>()
    if (chatIds.length > 0) {
      const allMessages = await db.query.messages.findMany({
        where: inArray(messages.chatId, chatIds),
        orderBy: desc(messages.createdAt),
        limit: 2000
      })
      for (const msg of allMessages) {
        if (!lastMessageByChat.has(msg.chatId)) lastMessageByChat.set(msg.chatId, msg)
      }
    }

    const phones = salonChats.map((c) => c.clientPhone.replace(/\D/g, ""))
    const customerByPhone = new Map<string, { name: string }>()
    if (phones.length > 0) {
      const rows = await db.query.customers.findMany({
        where: and(eq(customers.salonId, salonId), inArray(customers.phone, phones)),
        columns: { name: true, phone: true }
      })
      for (const c of rows) customerByPhone.set(c.phone, { name: c.name })
    }

    const defaultColumn = columns.find((c) => c.isDefault) ?? columns[0]
    const cardsByColumnId: Record<string, KanbanChatCard[]> = {}
    for (const col of columns) cardsByColumnId[col.id] = []

    const chatsWithMessages = salonChats.filter((c) => lastMessageByChat.has(c.id))

    for (const chat of chatsWithMessages) {
      const normalizedPhone = chat.clientPhone.replace(/\D/g, "")
      const customer = customerByPhone.get(normalizedPhone)
      const lastMessage = lastMessageByChat.get(chat.id)!
      const status: KanbanChatCard["status"] = chat.lastBotMessageRequiresResponse && chat.isManual
        ? "Aguardando humano"
        : chat.status === "completed"
          ? "Finalizado"
          : "Ativo"

      const card: KanbanChatCard = {
        id: chat.id,
        customer: {
          name: customer?.name || formatPhone(chat.clientPhone),
          phone: formatPhone(chat.clientPhone)
        },
        preview: lastMessage.content?.substring(0, 80) || "",
        lastMessageAt: formatPreviewTime(lastMessage.createdAt),
        isManual: chat.isManual,
        status,
        kanbanColumnId: chat.kanbanColumnId,
        kanbanPosition: chat.kanbanPosition !== null ? Number(chat.kanbanPosition) : null
      }

      const targetColumnId = chat.kanbanColumnId && cardsByColumnId[chat.kanbanColumnId]
        ? chat.kanbanColumnId
        : defaultColumn?.id

      if (targetColumnId) cardsByColumnId[targetColumnId].push(card)
    }

    for (const colId of Object.keys(cardsByColumnId)) {
      cardsByColumnId[colId].sort((a, b) => {
        if (a.kanbanPosition !== null && b.kanbanPosition !== null) {
          return a.kanbanPosition - b.kanbanPosition
        }
        if (a.kanbanPosition !== null) return -1
        if (b.kanbanPosition !== null) return 1
        return 0
      })
    }

    return {
      columns: columns.map((r) => ({
        id: r.id,
        salonId: r.salonId,
        name: r.name,
        color: r.color,
        position: r.position,
        isDefault: r.isDefault,
        isSystem: r.isSystem
      })),
      chatsByColumnId: cardsByColumnId
    }
  } catch (error) {
    console.error("Erro ao montar board kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function createKanbanColumn(input: {
  salonId: string
  name: string
  color?: string
}): Promise<{ id: string } | { error: string }> {
  const auth = await authorize(input.salonId)
  if ("error" in auth) return auth

  const name = input.name?.trim()
  if (!name) return { error: "Nome é obrigatório" }
  if (name.length > 40) return { error: "Nome deve ter no máximo 40 caracteres" }

  try {
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${chatKanbanColumns.position}), -1)` })
      .from(chatKanbanColumns)
      .where(eq(chatKanbanColumns.salonId, input.salonId))

    const [row] = await db
      .insert(chatKanbanColumns)
      .values({
        salonId: input.salonId,
        name,
        color: input.color || "#94a3b8",
        position: (maxPos ?? -1) + 1,
        isDefault: false,
        isSystem: false
      })
      .returning({ id: chatKanbanColumns.id })

    return { id: row.id }
  } catch (error) {
    console.error("Erro ao criar coluna kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function renameKanbanColumn(input: {
  columnId: string
  name?: string
  color?: string
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeByColumn(input.columnId)
  if ("error" in auth) return auth

  const updates: Partial<{ name: string; color: string; updatedAt: Date }> = { updatedAt: new Date() }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { error: "Nome é obrigatório" }
    if (name.length > 40) return { error: "Nome deve ter no máximo 40 caracteres" }
    updates.name = name
  }
  if (input.color !== undefined) updates.color = input.color

  try {
    await db.update(chatKanbanColumns).set(updates).where(eq(chatKanbanColumns.id, input.columnId))
    return { success: true }
  } catch (error) {
    console.error("Erro ao renomear coluna kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function deleteKanbanColumn(input: {
  columnId: string
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeByColumn(input.columnId)
  if ("error" in auth) return auth

  try {
    const column = await db.query.chatKanbanColumns.findFirst({
      where: eq(chatKanbanColumns.id, input.columnId),
      columns: { isDefault: true }
    })
    if (!column) return { error: "Coluna não encontrada" }
    if (column.isDefault) return { error: "Não é possível excluir a coluna padrão" }

    await db.delete(chatKanbanColumns).where(eq(chatKanbanColumns.id, input.columnId))
    return { success: true }
  } catch (error) {
    console.error("Erro ao excluir coluna kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function reorderKanbanColumns(input: {
  salonId: string
  orderedIds: string[]
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorize(input.salonId)
  if ("error" in auth) return auth

  if (!input.orderedIds?.length) return { error: "Lista de colunas vazia" }

  try {
    await db.transaction(async (tx) => {
      for (let i = 0; i < input.orderedIds.length; i++) {
        await tx
          .update(chatKanbanColumns)
          .set({ position: i, updatedAt: new Date() })
          .where(and(
            eq(chatKanbanColumns.id, input.orderedIds[i]),
            eq(chatKanbanColumns.salonId, input.salonId)
          ))
      }
    })
    return { success: true }
  } catch (error) {
    console.error("Erro ao reordenar colunas kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function getKanbanAIClassificationEnabled(
  salonId: string
): Promise<{ enabled: boolean } | { error: string }> {
  const auth = await authorize(salonId)
  if ("error" in auth) return auth

  try {
    const row = await db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { aiKanbanClassificationEnabled: true }
    })
    return { enabled: !!row?.aiKanbanClassificationEnabled }
  } catch (error) {
    console.error("Erro ao buscar flag de IA kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function setKanbanAIClassificationEnabled(input: {
  salonId: string
  enabled: boolean
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorize(input.salonId)
  if ("error" in auth) return auth

  try {
    await db
      .update(salons)
      .set({ aiKanbanClassificationEnabled: input.enabled, updatedAt: new Date() })
      .where(eq(salons.id, input.salonId))
    return { success: true }
  } catch (error) {
    console.error("Erro ao atualizar flag de IA kanban:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}

export async function moveChatToKanbanColumn(input: {
  chatId: string
  columnId: string | null
  position?: number | null
}): Promise<{ success: true } | { error: string }> {
  const auth = await authorizeByChat(input.chatId)
  if ("error" in auth) return auth

  if (input.columnId) {
    const column = await db.query.chatKanbanColumns.findFirst({
      where: eq(chatKanbanColumns.id, input.columnId),
      columns: { salonId: true }
    })
    if (!column) return { error: "Coluna não encontrada" }
    if (column.salonId !== auth.salonId) return { error: "Coluna pertence a outro salão" }
  }

  try {
    await db
      .update(chats)
      .set({
        kanbanColumnId: input.columnId,
        kanbanPosition: input.position !== undefined && input.position !== null
          ? input.position.toString()
          : null,
        updatedAt: new Date()
      })
      .where(eq(chats.id, input.chatId))
    return { success: true }
  } catch (error) {
    console.error("Erro ao mover chat:", error)
    return { error: error instanceof Error ? error.message : "Erro desconhecido" }
  }
}
