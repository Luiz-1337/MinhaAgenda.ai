"use client"

import { useDroppable } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { KanbanCard } from "./kanban-card"
import { ColumnSettingsMenu } from "./column-settings-menu"
import type { KanbanChatCard, KanbanColumnDTO } from "@/lib/types/kanban"

interface Props {
  column: KanbanColumnDTO
  allColumns: KanbanColumnDTO[]
  cards: KanbanChatCard[]
  onMoveCard: (cardId: string, columnId: string) => void
  onRenameColumn: (columnId: string, name: string, color: string) => Promise<void>
  onDeleteColumn: (columnId: string) => Promise<void>
}

export function KanbanColumn({
  column,
  allColumns,
  cards,
  onMoveCard,
  onRenameColumn,
  onDeleteColumn,
}: Props) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", columnId: column.id },
  })

  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `column-handle-${column.id}`,
    data: { type: "column-handle", columnId: column.id },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const cardIds = cards.map((c) => c.id)

  return (
    <div
      ref={setSortableRef}
      style={style}
      className={cn(
        "flex-shrink-0 w-72 bg-card rounded-lg border border-border flex flex-col max-h-full",
        isDragging && "shadow-xl"
      )}
    >
      <div className="p-3 border-b border-border flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Arrastar coluna"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
        >
          <GripVertical size={14} />
        </button>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-sm font-semibold text-foreground flex-1 truncate">{column.name}</h3>
        <span className="text-xs text-muted-foreground font-mono">{cards.length}</span>
        <ColumnSettingsMenu
          column={column}
          onRename={onRenameColumn}
          onDelete={onDeleteColumn}
        />
      </div>

      <div
        ref={setDroppableRef}
        className={cn(
          "flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar transition-colors",
          isOver && "bg-accent/30"
        )}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard key={card.id} card={card} columns={allColumns} onMove={onMoveCard} />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-8">Nenhum chat</div>
        )}
      </div>
    </div>
  )
}
