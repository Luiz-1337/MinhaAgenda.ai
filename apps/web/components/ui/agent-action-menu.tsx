"use client"

import { useState, useRef, useEffect } from "react"
import { MoreHorizontal, Pencil, Trash2, Copy, Power, ChevronRight } from "lucide-react"

interface AgentActionMenuProps {
  onEdit: () => void
  onDelete: () => void
  onDuplicate: () => void
  onToggleActive: () => void
  isActive: boolean
  onOpenChange?: (isOpen: boolean) => void
}

export function AgentActionMenu({
  onEdit,
  onDelete,
  onDuplicate,
  onToggleActive,
  isActive,
  onOpenChange,
}: AgentActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        onOpenChange?.(false)
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onOpenChange])

  function handleToggle() {
    const newState = !isOpen
    setIsOpen(newState)
    onOpenChange?.(newState)
  }

  return (
    <div className="relative z-10" ref={menuRef}>
      <button
        onClick={handleToggle}
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
              onClick={() => {
                onEdit()
                setIsOpen(false)
                onOpenChange?.(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-info/10 text-info group-hover:bg-info group-hover:text-foreground transition-all">
                  <Pencil size={12} />
                </div>
                <span>Editar detalhes</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => {
                onDuplicate()
                setIsOpen(false)
                onOpenChange?.(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-success/10 text-success group-hover:bg-success group-hover:text-foreground transition-all">
                  <Copy size={12} />
                </div>
                <span>Duplicar agente</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => {
                onToggleActive()
                setIsOpen(false)
                onOpenChange?.(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-warning/10 text-warning group-hover:bg-warning group-hover:text-foreground transition-all">
                  <Power size={12} />
                </div>
                <span>{isActive ? "Desativar agente" : "Ativar agente"}</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => {
                onDelete()
                setIsOpen(false)
                onOpenChange?.(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-sm bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-foreground transition-all">
                  <Trash2 size={12} />
                </div>
                <span>Remover item</span>
              </div>
              <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
