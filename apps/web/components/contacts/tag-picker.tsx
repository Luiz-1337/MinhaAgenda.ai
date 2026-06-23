"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Loader2, Tag as TagIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { TagPill, PRESET_TAG_COLORS } from "./tag-pill"
import { createSalonTag, type TagRow } from "@/app/actions/customer-tags"

const BTN =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

interface TagPickerProps {
  salonId: string
  catalog: TagRow[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** Chamado quando o usuário cria uma tag nova (parent atualiza o catálogo). */
  onTagCreated: (tag: TagRow) => void
  disabled?: boolean
}

/** Seletor de tags para os diálogos de contato: atribui tags do catálogo e cria novas na hora. */
export function TagPicker({
  salonId,
  catalog,
  selectedIds,
  onChange,
  onTagCreated,
  disabled,
}: TagPickerProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<string>(PRESET_TAG_COLORS[0])
  const [isSaving, setIsSaving] = useState(false)

  const selected = selectedIds
    .map((id) => catalog.find((t) => t.id === id))
    .filter((t): t is TagRow => Boolean(t))

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id]
    )
  }

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      toast.error("Digite um nome para a tag")
      return
    }
    setIsSaving(true)
    const res = await createSalonTag({ salonId, name, color: newColor })
    setIsSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    if (!res.data) return
    onTagCreated(res.data)
    onChange([...selectedIds, res.data.id])
    setNewName("")
    setNewColor(PRESET_TAG_COLORS[0])
    setCreating(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[24px]">
        {selected.length > 0 ? (
          selected.map((tag) => (
            <TagPill key={tag.id} tag={tag} onRemove={disabled ? undefined : () => toggle(tag.id)} />
          ))
        ) : (
          <span className="text-xs text-muted-foreground">Nenhuma tag atribuída</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={disabled} className={BTN}>
              <TagIcon size={14} /> Atribuir tag
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Tags do salão</DropdownMenuLabel>
            {catalog.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma tag criada ainda</div>
            ) : (
              catalog.map((tag) => (
                <DropdownMenuCheckboxItem
                  key={tag.id}
                  checked={selectedIds.includes(tag.id)}
                  onCheckedChange={() => toggle(tag.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </span>
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <button type="button" disabled={disabled} onClick={() => setCreating((v) => !v)} className={BTN}>
          <Plus size={14} /> Nova tag
        </button>
      </div>

      {creating && (
        <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da tag (ex.: VIP)"
            maxLength={30}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-border p-0"
              aria-label="Cor personalizada"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-accent-foreground rounded-md transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Adicionar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
