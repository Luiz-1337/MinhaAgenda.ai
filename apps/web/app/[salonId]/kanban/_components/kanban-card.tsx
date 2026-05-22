"use client"

import { useRouter, useParams } from "next/navigation"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { MoreHorizontal, GripVertical } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { KanbanChatCard, KanbanColumnDTO } from "@/lib/types/kanban"

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()
}

function statusClasses(status: KanbanChatCard["status"]): string {
  switch (status) {
    case "Ativo":
      return "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
    case "Finalizado":
      return "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
    case "Aguardando humano":
      return "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
  }
}

interface KanbanCardProps {
  card: KanbanChatCard
  columns: KanbanColumnDTO[]
  onMove: (cardId: string, columnId: string) => void
}

export function KanbanCard({ card, columns, onMove }: KanbanCardProps) {
  const router = useRouter()
  const params = useParams<{ salonId: string }>()

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", columnId: card.kanbanColumnId },
  })

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  function handleOpenChat() {
    router.push(`/${params.salonId}/chat?chatId=${card.id}`)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative bg-card border border-border rounded-md p-3 hover:border-ring/40 transition-colors",
        isDragging && "shadow-lg"
      )}
    >
      <div className="flex gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Arrastar"
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground -ml-1 px-0.5 self-stretch flex items-center"
        >
          <GripVertical size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                {getInitials(card.customer.name)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{card.customer.name}</p>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{card.customer.phone}</p>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent"
                  aria-label="Mais opções"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleOpenChat}>Abrir conversa</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Mover para</DropdownMenuLabel>
                {columns
                  .filter((c) => c.id !== card.kanbanColumnId)
                  .map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => onMove(card.id, c.id)}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{card.preview}</p>

          <div className="flex items-center justify-between mt-2 gap-2">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full border text-[9px] font-medium",
                statusClasses(card.status)
              )}
            >
              {card.status}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">{card.lastMessageAt}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
