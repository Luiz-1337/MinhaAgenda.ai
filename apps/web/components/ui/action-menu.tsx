"use client"

import { MoreHorizontal, Pencil, Trash2, ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

interface ActionMenuProps {
  onEdit: () => void
  onDelete: () => void
}

export function ActionMenu({ onEdit, onDelete }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Ações do item"
          className="p-1.5 rounded-md transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-muted data-[state=open]:bg-primary data-[state=open]:text-primary-foreground"
        >
          <MoreHorizontal size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 py-1.5">
        <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Ações do Item
        </DropdownMenuLabel>

        <DropdownMenuItem
          onSelect={onEdit}
          className="group/menuitem justify-between px-3 py-2 text-xs font-medium cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-sm bg-info/10 text-info group-hover/menuitem:bg-info group-hover/menuitem:text-info-foreground transition-colors">
              <Pencil size={12} />
            </div>
            <span>Editar detalhes</span>
          </div>
          <ChevronRight size={12} className="opacity-0 group-hover/menuitem:opacity-100 transition-opacity" />
        </DropdownMenuItem>

        <DropdownMenuItem
          variant="destructive"
          onSelect={onDelete}
          className="group/menuitem justify-between px-3 py-2 text-xs font-medium cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-sm bg-destructive/10 text-destructive group-hover/menuitem:bg-destructive group-hover/menuitem:text-destructive-foreground transition-colors">
              <Trash2 size={12} />
            </div>
            <span>Remover item</span>
          </div>
          <ChevronRight size={12} className="opacity-0 group-hover/menuitem:opacity-100 transition-opacity" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
