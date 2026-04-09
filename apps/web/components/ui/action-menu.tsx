"use client"

import { useState, useRef, useEffect } from "react"
import { MoreHorizontal, Pencil, Trash2, ChevronRight } from "lucide-react"

interface ActionMenuProps {
  onEdit: () => void
  onDelete: () => void
}

export function ActionMenu({ onEdit, onDelete }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded-md transition-all duration-150 ${
          isOpen
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <MoreHorizontal size={18} />
      </button>

      {isOpen && (
        <>
          {/* Small Floating Popup */}
          <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-md shadow-lg z-20 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150 py-1.5">
            <div className="px-3 py-1.5 mb-1 border-b border-border-subtle">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Acoes do Item</p>
            </div>

            <button
              onClick={() => { onEdit(); setIsOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-info/5 transition-all group/menuitem"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-info/10 text-info group-hover/menuitem:bg-info group-hover/menuitem:text-info-foreground transition-colors">
                  <Pencil size={12} />
                </div>
                <span>Editar detalhes</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover/menuitem:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => { onDelete(); setIsOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 transition-all group/menuitem"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-destructive/10 text-destructive group-hover/menuitem:bg-destructive group-hover/menuitem:text-destructive-foreground transition-colors">
                  <Trash2 size={12} />
                </div>
                <span>Remover item</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover/menuitem:opacity-100 transition-opacity" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
