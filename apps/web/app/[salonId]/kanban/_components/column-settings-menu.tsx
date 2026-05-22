"use client"

import { useState } from "react"
import { MoreVertical, Pencil, Trash2 } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const PALETTE = [
  "#f59e0b", "#3b82f6", "#10b981", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#64748b",
]

interface Props {
  column: { id: string; name: string; color: string; isDefault: boolean }
  onRename: (columnId: string, name: string, color: string) => Promise<void>
  onDelete: (columnId: string) => Promise<void>
}

export function ColumnSettingsMenu({ column, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(column.name)
  const [color, setColor] = useState(column.color)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await onRename(column.id, name.trim(), color)
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  function handleOpen(o: boolean) {
    setOpen(o)
    if (o) {
      setName(column.name)
      setColor(column.color)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Opções da coluna"
            className="p-1 text-muted-foreground hover:text-foreground rounded-sm hover:bg-accent"
          >
            <MoreVertical size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleOpen(true)}>
            <Pencil size={14} /> Editar
          </DropdownMenuItem>
          {!column.isDefault && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                if (confirm(`Excluir coluna "${column.name}"? Chats nela voltam para a coluna padrão.`)) {
                  onDelete(column.id)
                }
              }}
            >
              <Trash2 size={14} /> Excluir
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nome</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                placeholder="Ex: Em VIP"
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
