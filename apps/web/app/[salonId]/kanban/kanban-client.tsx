"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, horizontalListSortingStrategy, arrayMove } from "@dnd-kit/sortable"
import { Search, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  listKanbanBoard,
  moveChatToKanbanColumn,
  createKanbanColumn,
  renameKanbanColumn,
  deleteKanbanColumn,
  reorderKanbanColumns,
  getKanbanAIClassificationEnabled,
  setKanbanAIClassificationEnabled,
} from "@/app/actions/kanban"
import type { KanbanBoardDTO, KanbanChatCard, KanbanColumnDTO } from "@/lib/types/kanban"
import { Switch } from "@/components/ui/switch"
import { Sparkles } from "lucide-react"
import { KanbanColumn } from "./_components/kanban-column"
import { KanbanCard } from "./_components/kanban-card"
import { CreateColumnDialog } from "./_components/create-column-dialog"

const POSITION_STEP = 1000

function computePosition(cards: KanbanChatCard[], targetIndex: number): number {
  const positions = cards.map((c) => c.kanbanPosition)
  const prev = targetIndex > 0 ? positions[targetIndex - 1] : null
  const next = targetIndex < positions.length ? positions[targetIndex] : null

  if (prev === null && next === null) return POSITION_STEP
  if (prev === null) return (next as number) - POSITION_STEP
  if (next === null) return prev + POSITION_STEP
  return (prev + next) / 2
}

export default function KanbanClient({ salonId }: { salonId: string }) {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState("")
  const [activeCard, setActiveCard] = useState<KanbanChatCard | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const { data: aiClassification } = useQuery({
    queryKey: ["kanban-ai-flag", salonId],
    queryFn: async () => {
      const result = await getKanbanAIClassificationEnabled(salonId)
      if ("error" in result) return { enabled: false }
      return result
    },
    enabled: !!salonId,
    staleTime: 60_000,
  })

  async function handleToggleAIClassification(enabled: boolean) {
    queryClient.setQueryData(["kanban-ai-flag", salonId], { enabled })
    const result = await setKanbanAIClassificationEnabled({ salonId, enabled })
    if ("error" in result) {
      toast.error(result.error)
      queryClient.invalidateQueries({ queryKey: ["kanban-ai-flag", salonId] })
    } else {
      toast.success(enabled ? "IA classificará chats automaticamente" : "Classificação por IA desativada")
    }
  }

  const { data: board, isLoading } = useQuery<KanbanBoardDTO>({
    queryKey: ["kanban", salonId],
    queryFn: async () => {
      const result = await listKanbanBoard(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return { columns: [], chatsByColumnId: {} }
      }
      return result
    },
    enabled: !!salonId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })

  const filteredBoard = useMemo<KanbanBoardDTO>(() => {
    if (!board) return { columns: [], chatsByColumnId: {} }
    const q = query.trim().toLowerCase()
    if (!q) return board

    const qDigits = q.replace(/\D/g, "")
    const filtered: Record<string, KanbanChatCard[]> = {}
    for (const colId of Object.keys(board.chatsByColumnId)) {
      filtered[colId] = board.chatsByColumnId[colId].filter(
        (c) =>
          c.customer.name.toLowerCase().includes(q) ||
          c.preview.toLowerCase().includes(q) ||
          (qDigits.length > 0 && c.customer.phone.replace(/\D/g, "").includes(qDigits))
      )
    }
    return { columns: board.columns, chatsByColumnId: filtered }
  }, [board, query])

  function findCardLocation(cardId: string): { columnId: string; index: number } | null {
    if (!board) return null
    for (const colId of Object.keys(board.chatsByColumnId)) {
      const idx = board.chatsByColumnId[colId].findIndex((c) => c.id === cardId)
      if (idx >= 0) return { columnId: colId, index: idx }
    }
    return null
  }

  function applyOptimistic(next: KanbanBoardDTO) {
    queryClient.setQueryData<KanbanBoardDTO>(["kanban", salonId], next)
  }

  async function persistMove(chatId: string, columnId: string, position: number) {
    const result = await moveChatToKanbanColumn({ chatId, columnId, position })
    if ("error" in result) {
      toast.error(result.error)
      queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
    } else {
      queryClient.invalidateQueries({ queryKey: ["conversations", salonId] })
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string
    const location = findCardLocation(cardId)
    if (location && board) {
      const card = board.chatsByColumnId[location.columnId][location.index]
      setActiveCard(card)
    } else {
      setActiveCard(null)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null)
    const { active, over } = event
    if (!over || !board) return

    const activeType = active.data.current?.type as string | undefined
    const overType = over.data.current?.type as string | undefined

    if (activeType === "column-handle" && overType === "column-handle") {
      const activeColId = (active.data.current as { columnId: string }).columnId
      const overColId = (over.data.current as { columnId: string }).columnId
      if (activeColId === overColId) return
      const oldIndex = board.columns.findIndex((c) => c.id === activeColId)
      const newIndex = board.columns.findIndex((c) => c.id === overColId)
      if (oldIndex < 0 || newIndex < 0) return

      const newColumns = arrayMove(board.columns, oldIndex, newIndex)
      applyOptimistic({ ...board, columns: newColumns })

      const result = await reorderKanbanColumns({ salonId, orderedIds: newColumns.map((c) => c.id) })
      if ("error" in result) {
        toast.error(result.error)
        queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
      }
      return
    }

    if (activeType !== "card") return

    const sourceLocation = findCardLocation(active.id as string)
    if (!sourceLocation) return

    let targetColumnId: string
    let targetIndex: number

    if (overType === "card") {
      const overLocation = findCardLocation(over.id as string)
      if (!overLocation) return
      targetColumnId = overLocation.columnId
      targetIndex = overLocation.index
      if (sourceLocation.columnId === targetColumnId && sourceLocation.index < targetIndex) {
        targetIndex += 1
      }
    } else if (overType === "column") {
      targetColumnId = (over.data.current as { columnId: string }).columnId
      targetIndex = board.chatsByColumnId[targetColumnId]?.length ?? 0
    } else {
      return
    }

    const sourceCards = [...board.chatsByColumnId[sourceLocation.columnId]]
    const [movedCard] = sourceCards.splice(sourceLocation.index, 1)
    const targetCards = sourceLocation.columnId === targetColumnId
      ? sourceCards
      : [...(board.chatsByColumnId[targetColumnId] ?? [])]

    const insertIndex = Math.min(targetIndex, targetCards.length)
    const newPosition = computePosition(targetCards, insertIndex)

    const updatedCard: KanbanChatCard = {
      ...movedCard,
      kanbanColumnId: targetColumnId,
      kanbanPosition: newPosition,
    }
    targetCards.splice(insertIndex, 0, updatedCard)

    const nextChats: Record<string, KanbanChatCard[]> = { ...board.chatsByColumnId }
    if (sourceLocation.columnId === targetColumnId) {
      nextChats[targetColumnId] = targetCards
    } else {
      nextChats[sourceLocation.columnId] = sourceCards
      nextChats[targetColumnId] = targetCards
    }
    applyOptimistic({ ...board, chatsByColumnId: nextChats })

    await persistMove(movedCard.id, targetColumnId, newPosition)
  }

  async function handleMoveCardViaMenu(cardId: string, columnId: string) {
    if (!board) return
    const sourceLocation = findCardLocation(cardId)
    if (!sourceLocation) return
    if (sourceLocation.columnId === columnId) return

    const targetCards = [...(board.chatsByColumnId[columnId] ?? [])]
    const newPosition = computePosition(targetCards, targetCards.length)

    const sourceCards = [...board.chatsByColumnId[sourceLocation.columnId]]
    const [movedCard] = sourceCards.splice(sourceLocation.index, 1)
    const updatedCard: KanbanChatCard = {
      ...movedCard,
      kanbanColumnId: columnId,
      kanbanPosition: newPosition,
    }
    targetCards.push(updatedCard)

    applyOptimistic({
      ...board,
      chatsByColumnId: {
        ...board.chatsByColumnId,
        [sourceLocation.columnId]: sourceCards,
        [columnId]: targetCards,
      },
    })

    await persistMove(cardId, columnId, newPosition)
  }

  async function handleCreateColumn(name: string, color: string) {
    const result = await createKanbanColumn({ salonId, name, color })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Coluna criada")
    queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
    queryClient.invalidateQueries({ queryKey: ["kanban-columns", salonId] })
  }

  async function handleRenameColumn(columnId: string, name: string, color: string) {
    const result = await renameKanbanColumn({ columnId, name, color })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Coluna atualizada")
    queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
    queryClient.invalidateQueries({ queryKey: ["kanban-columns", salonId] })
  }

  async function handleDeleteColumn(columnId: string) {
    const result = await deleteKanbanColumn({ columnId })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Coluna excluída")
    queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
    queryClient.invalidateQueries({ queryKey: ["kanban-columns", salonId] })
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    )
  }

  if (!board || board.columns.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Nenhuma coluna configurada.</p>
        <CreateColumnDialog onCreate={handleCreateColumn} />
      </div>
    )
  }

  const columnHandleIds = filteredBoard.columns.map((c) => `column-handle-${c.id}`)

  return (
    <div className="h-full p-2 md:p-6 flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">Kanban</h1>
          <CreateColumnDialog onCreate={handleCreateColumn} />
          <label
            className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none"
            title="A IA move chats entre colunas automaticamente durante a conversa (pending/in_progress/completed/attention)."
          >
            <Sparkles size={14} className={aiClassification?.enabled ? "text-amber-500" : ""} />
            <span>IA classifica</span>
            <Switch
              checked={!!aiClassification?.enabled}
              onCheckedChange={handleToggleAIClassification}
            />
          </label>
        </div>
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-ring/50 transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={columnHandleIds} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4 flex-1 overflow-x-auto overflow-y-hidden pb-2 custom-scrollbar">
            {filteredBoard.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                allColumns={filteredBoard.columns}
                cards={filteredBoard.chatsByColumnId[column.id] ?? []}
                onMoveCard={handleMoveCardViaMenu}
                onRenameColumn={handleRenameColumn}
                onDeleteColumn={handleDeleteColumn}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeCard ? (
            <div className="opacity-90">
              <KanbanCard card={activeCard} columns={filteredBoard.columns} onMove={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
