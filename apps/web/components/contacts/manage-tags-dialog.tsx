"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Plus, Loader2, Trash2, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { PRESET_TAG_COLORS } from "./tag-pill"
import {
  createSalonTag,
  updateSalonTag,
  deleteSalonTag,
  type TagRow,
} from "@/app/actions/customer-tags"

interface ManageTagsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  catalog: TagRow[]
  /** Disparado após qualquer mudança no catálogo (parent revalida as queries). */
  onChanged: () => void
}

export function ManageTagsDialog({
  open,
  onOpenChange,
  salonId,
  catalog,
  onChanged,
}: ManageTagsDialogProps) {
  const [newName, setNewName] = useState("")
  const [newColor, setNewColor] = useState<string>(PRESET_TAG_COLORS[0])
  const [isCreating, setIsCreating] = useState(false)

  async function handleCreate() {
    const name = newName.trim()
    if (!name) {
      toast.error("Digite um nome para a tag")
      return
    }
    setIsCreating(true)
    const res = await createSalonTag({ salonId, name, color: newColor })
    setIsCreating(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Tag criada")
    setNewName("")
    setNewColor(PRESET_TAG_COLORS[0])
    onChanged()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar tags</DialogTitle>
          <DialogDescription>
            Crie, renomeie, recolora ou exclua as tags do salão. Excluir uma tag a remove de todos os contatos.
          </DialogDescription>
        </DialogHeader>

        {/* Nova tag */}
        <div className="rounded-md border border-border p-3 space-y-2 bg-muted/30">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da nova tag (ex.: VIP)"
            maxLength={30}
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
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-accent hover:bg-accent/90 text-accent-foreground rounded-md transition-all disabled:opacity-50"
            >
              {isCreating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Criar
            </button>
          </div>
        </div>

        {/* Lista do catálogo */}
        <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5 -mx-1 px-1">
          {catalog.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Nenhuma tag criada ainda.</p>
          ) : (
            catalog.map((tag) => (
              <TagEditorRow key={tag.id} salonId={salonId} tag={tag} onChanged={onChanged} />
            ))
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Fechar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TagEditorRow({
  salonId,
  tag,
  onChanged,
}: {
  salonId: string
  tag: TagRow
  onChanged: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const dirty = name.trim() !== tag.name || color !== tag.color

  async function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Nome da tag é obrigatório")
      return
    }
    setIsSaving(true)
    const res = await updateSalonTag({ tagId: tag.id, salonId, name: trimmed, color })
    setIsSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Tag atualizada")
    onChanged()
  }

  async function handleDelete() {
    setIsSaving(true)
    const res = await deleteSalonTag(tag.id, salonId)
    setIsSaving(false)
    if ("error" in res) {
      toast.error(res.error)
      return
    }
    toast.success("Tag excluída")
    onChanged()
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
        <span className="text-xs text-foreground">Excluir “{tag.name}”? Remove de todos os contatos.</span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="text-xs font-bold text-destructive hover:underline disabled:opacity-50"
          >
            {isSaving ? "Excluindo..." : "Excluir"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="w-6 h-6 rounded cursor-pointer bg-transparent border border-border p-0 shrink-0"
        aria-label={`Cor da tag ${tag.name}`}
      />
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) {
            e.preventDefault()
            handleSave()
          }
        }}
        className="flex-1 min-w-0 bg-transparent border-0 px-1 py-1 text-sm text-foreground focus:outline-none"
      />
      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="p-1.5 rounded-md text-success hover:bg-muted transition-colors disabled:opacity-50"
          aria-label="Salvar tag"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
        aria-label="Excluir tag"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}
