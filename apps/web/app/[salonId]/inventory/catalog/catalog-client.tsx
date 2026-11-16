"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Tags, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deleteCatalogEntry, saveCatalogEntry } from "@/app/actions/purchases"
import type { ProductCatalogKind } from "@repo/db"
import type { ProductCatalogDTO, ProductCatalogEntryDTO } from "@/lib/types/purchase"
import { InventoryNav, Modal, iconButtonClass, inputClass, labelClass } from "../inventory-ui"

const TEXT: Record<
  ProductCatalogKind,
  { title: string; add: string; created: string; saved: string; deleted: string; empty: string; remove: string }
> = {
  brand: {
    title: "Marcas",
    add: "Nova marca",
    created: "Marca criada",
    saved: "Marca salva",
    deleted: "Marca excluída",
    empty: "Nenhuma marca cadastrada.",
    remove: "Excluir marca",
  },
  category: {
    title: "Categorias",
    add: "Nova categoria",
    created: "Categoria criada",
    saved: "Categoria salva",
    deleted: "Categoria excluída",
    empty: "Nenhuma categoria cadastrada.",
    remove: "Excluir categoria",
  },
}

type Editing = { kind: ProductCatalogKind; entry: ProductCatalogEntryDTO | null }

/**
 * Marcas e categorias de produto (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * O produto recebe a marca e a categoria em Estoque > Configurar. Excluir uma
 * marca ou categoria não apaga produto: ele só fica sem ela.
 */
export function CatalogClient({ salonId, data }: { salonId: string; data: ProductCatalogDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState<Editing | null>(null)
  const [name, setName] = useState("")
  const [toDelete, setToDelete] = useState<{ kind: ProductCatalogKind; entry: ProductCatalogEntryDTO } | null>(null)

  function open(kind: ProductCatalogKind, entry: ProductCatalogEntryDTO | null) {
    setName(entry?.name ?? "")
    setEditing({ kind, entry })
  }

  function submit() {
    const current = editing
    if (!current) return
    if (!name.trim()) {
      toast.error("Informe o nome")
      return
    }

    startTransition(async () => {
      const result = await saveCatalogEntry({ salonId, kind: current.kind, id: current.entry?.id ?? null, name })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(current.entry ? TEXT[current.kind].saved : TEXT[current.kind].created)
      setEditing(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const current = toDelete
    if (!current) return

    startTransition(async () => {
      const result = await deleteCatalogEntry({ salonId, kind: current.kind, id: current.entry.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(TEXT[current.kind].deleted)
      router.refresh()
    })
  }

  function renderList(kind: ProductCatalogKind, entries: ProductCatalogEntryDTO[]) {
    const text = TEXT[kind]
    return (
      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{text.title}</h3>
          {data.can.manage && (
            <Button variant="outline" size="sm" onClick={() => open(kind, null)} disabled={isPending}>
              <Plus size={14} />
              {text.add}
            </Button>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{text.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <p className="font-semibold text-foreground">{entry.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {entry.productCount} {entry.productCount === 1 ? "produto" : "produtos"}
                  </p>
                </div>
                {data.can.manage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => open(kind, entry)}
                      disabled={isPending}
                      aria-label={`Renomear ${entry.name}`}
                      title="Renomear"
                      className={iconButtonClass}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete({ kind, entry })}
                      disabled={isPending}
                      aria-label={`Excluir ${entry.name}`}
                      title="Excluir"
                      className={iconButtonClass}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Tags size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Marcas e categorias</h2>
          <p className="text-xs text-muted-foreground">
            Para organizar os produtos. A marca e a categoria de cada produto são escolhidas em Produtos e saldo &gt;
            Configurar.
          </p>
        </div>
      </div>

      <InventoryNav salonId={salonId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderList("brand", data.brands)}
        {renderList("category", data.categories)}
      </div>

      {editing && (
        <Modal
          title={editing.entry ? `Renomear — ${editing.entry.name}` : TEXT[editing.kind].add}
          onClose={() => setEditing(null)}
          disabled={isPending}
        >
          <div className="p-4 flex flex-col gap-1">
            <label htmlFor="catalog-name" className={labelClass}>
              Nome
            </label>
            <input
              id="catalog-name"
              type="text"
              maxLength={60}
              value={name}
              disabled={isPending}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit()
              }}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={toDelete ? TEXT[toDelete.kind].remove : "Excluir"}
        description={
          toDelete && toDelete.entry.productCount > 0
            ? `${toDelete.entry.productCount} ${
                toDelete.entry.productCount === 1 ? "produto fica" : "produtos ficam"
              } sem ${toDelete.kind === "brand" ? "marca" : "categoria"}. Nenhum produto é apagado.`
            : "Nenhum produto usa este cadastro."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
