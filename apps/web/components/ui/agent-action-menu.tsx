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
        className={`p-1.5 rounded-lg transition-all duration-200 ${
          isOpen
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 scale-110"
            : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
        }`}
      >
        <MoreHorizontal size={18} />
      </button>

      {isOpen && (
        <>
          {/* Small Floating Popup */}
          <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[9999] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150 py-1.5">
            <div className="px-3 py-1.5 mb-1 border-b border-slate-50 dark:border-white/5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações do Item</p>
            </div>

            <button
              onClick={() => {
                onEdit()
                setIsOpen(false)
                onOpenChange?.(false)
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-all">
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
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
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
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all">
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
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all group"
            >
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-red-500/10 text-red-500 group-hover:bg-red-500 group-hover:text-white transition-all">
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

