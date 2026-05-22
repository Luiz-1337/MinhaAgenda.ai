import { Result, ok, fail } from "../../../shared/types"
import { DomainError } from "../../../domain/errors"
import { db, chats, chatKanbanColumns, salons, and, eq } from "@repo/db"
import { SetChatKanbanColumnDTO, SetChatKanbanColumnResultDTO } from "../../dtos"

export class KanbanClassificationDisabledError extends DomainError {
  readonly code = "KANBAN_CLASSIFICATION_DISABLED"
  constructor() {
    super("Auto-classificação por IA está desativada para este salão")
  }
}

export class KanbanColumnNotFoundError extends DomainError {
  readonly code = "KANBAN_COLUMN_NOT_FOUND"
  constructor(category: string) {
    super(`Coluna kanban não encontrada para a categoria "${category}"`)
  }
}

export class ChatNotFoundError extends DomainError {
  readonly code = "CHAT_NOT_FOUND"
  constructor(chatId: string) {
    super(`Chat ${chatId} não encontrado`)
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  pending: "Pendentes",
  in_progress: "Andamento",
  completed: "Concluídas",
  attention: "Atenção"
}

/**
 * Move um chat para a coluna kanban correspondente à categoria semântica.
 *
 * Resolve `category` → `chat_kanban_columns.system_key` para sobreviver a
 * renames feitos pelo usuário. Se a feature flag `aiKanbanClassificationEnabled`
 * do salão estiver desligada, retorna erro sem escrever no DB.
 *
 * Anti-thrashing: se o chat já está na coluna alvo, é no-op silencioso
 * (retorna `changed: false`) — evita IA ficar pingue-pongando o chat.
 */
export class SetChatKanbanColumnUseCase {
  async execute(
    input: SetChatKanbanColumnDTO
  ): Promise<Result<SetChatKanbanColumnResultDTO, DomainError>> {
    const salon = await db.query.salons.findFirst({
      where: eq(salons.id, input.salonId),
      columns: { aiKanbanClassificationEnabled: true }
    })

    if (!salon?.aiKanbanClassificationEnabled) {
      return fail(new KanbanClassificationDisabledError())
    }

    const targetColumn = await db.query.chatKanbanColumns.findFirst({
      where: and(
        eq(chatKanbanColumns.salonId, input.salonId),
        eq(chatKanbanColumns.systemKey, input.category)
      ),
      columns: { id: true, name: true }
    })

    if (!targetColumn) {
      return fail(new KanbanColumnNotFoundError(input.category))
    }

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, input.chatId),
      columns: { id: true, salonId: true, kanbanColumnId: true }
    })

    if (!chat || chat.salonId !== input.salonId) {
      return fail(new ChatNotFoundError(input.chatId))
    }

    if (chat.kanbanColumnId === targetColumn.id) {
      return ok({
        chatId: chat.id,
        columnId: targetColumn.id,
        columnName: targetColumn.name,
        changed: false,
        message: `Chat já está em ${targetColumn.name}, nenhuma mudança`
      })
    }

    await db
      .update(chats)
      .set({ kanbanColumnId: targetColumn.id, updatedAt: new Date() })
      .where(eq(chats.id, chat.id))

    return ok({
      chatId: chat.id,
      columnId: targetColumn.id,
      columnName: targetColumn.name,
      changed: true,
      message: `Chat movido para ${targetColumn.name} (${CATEGORY_LABEL[input.category]}): ${input.reason}`
    })
  }
}
