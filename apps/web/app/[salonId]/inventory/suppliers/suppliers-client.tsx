"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Power, Trash2, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deleteSupplier, saveSupplier, setSupplierActive } from "@/app/actions/purchases"
import type { SupplierDTO, SuppliersDTO } from "@/lib/types/purchase"
import { InventoryNav, Modal, iconButtonClass, inputClass, labelClass } from "../inventory-ui"

type Draft = { name: string; document: string; phone: string; email: string; notes: string }

const EMPTY: Draft = { name: "", document: "", phone: "", email: "", notes: "" }

/** "12345678000190" → "12.345.678/0001-90"; "12345678901" → "123.456.789-01". */
function formatDocument(document: string): string {
  if (document.length === 11) return document.replace(/^(.{3})(.{3})(.{3})(.{2})$/, "$1.$2.$3-$4")
  if (document.length === 14) return document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5")
  return document
}

/**
 * Fornecedores (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * Fornecedor com compra lançada não se exclui — desativa-se: ele some da nova
 * compra e o histórico fica.
 */
export function SuppliersClient({ salonId, data }: { salonId: string; data: SuppliersDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  /** `null` = fechado · `"new"` = cadastro novo · um fornecedor = edição. */
  const [editing, setEditing] = useState<SupplierDTO | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [toDelete, setToDelete] = useState<SupplierDTO | null>(null)

  function openNew() {
    setDraft(EMPTY)
    setEditing("new")
  }

  function openEdit(supplier: SupplierDTO) {
    setDraft({
      name: supplier.name,
      document: supplier.document ? formatDocument(supplier.document) : "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      notes: supplier.notes ?? "",
    })
    setEditing(supplier)
  }

  function submit() {
    if (!editing) return
    if (draft.name.trim().length < 2) {
      toast.error("Informe o nome do fornecedor")
      return
    }

    const supplierId = editing === "new" ? null : editing.id

    startTransition(async () => {
      const result = await saveSupplier({
        salonId,
        supplierId,
        name: draft.name,
        document: draft.document.trim() || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        notes: draft.notes.trim() || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(supplierId ? "Fornecedor salvo" : "Fornecedor cadastrado")
      setEditing(null)
      router.refresh()
    })
  }

  function toggleActive(supplier: SupplierDTO) {
    startTransition(async () => {
      const result = await setSupplierActive({ salonId, supplierId: supplier.id, isActive: !supplier.isActive })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(supplier.isActive ? "Fornecedor desativado" : "Fornecedor reativado")
      router.refresh()
    })
  }

  function confirmDelete() {
    const supplier = toDelete
    if (!supplier) return

    startTransition(async () => {
      const result = await deleteSupplier({ salonId, supplierId: supplier.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Fornecedor excluído")
      router.refresh()
    })
  }

  const field = (key: keyof Draft) => ({
    value: draft[key],
    disabled: isPending,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [key]: event.target.value })),
    className: inputClass,
  })

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Truck size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Fornecedores</h2>
            <p className="text-xs text-muted-foreground">De quem o salão compra os produtos.</p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={openNew} disabled={isPending}>
            <Plus size={16} />
            Novo fornecedor
          </Button>
        )}
      </div>

      <InventoryNav salonId={salonId} />

      <section className="bg-card border border-border rounded-md">
        {data.suppliers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Fornecedor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Documento</th>
                  <th scope="col" className="p-3 text-left font-semibold">Contato</th>
                  <th scope="col" className="p-3 text-right font-semibold">Compras</th>
                  <th scope="col" className="p-3 w-32"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.suppliers.map((supplier) => (
                  <tr key={supplier.id} className={supplier.isActive ? undefined : "opacity-60"}>
                    <td className="p-3 font-semibold text-foreground">
                      {supplier.name}
                      {(!supplier.isActive || supplier.notes) && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {[supplier.isActive ? null : "inativo", supplier.notes].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {supplier.document ? formatDocument(supplier.document) : "—"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {[supplier.phone, supplier.email].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{supplier.purchaseCount}</td>
                    <td className="p-2">
                      {data.can.manage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(supplier)}
                            disabled={isPending}
                            aria-label={`Editar ${supplier.name}`}
                            title="Editar"
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActive(supplier)}
                            disabled={isPending}
                            aria-label={supplier.isActive ? `Desativar ${supplier.name}` : `Reativar ${supplier.name}`}
                            title={supplier.isActive ? "Desativar" : "Reativar"}
                            className={iconButtonClass}
                          >
                            <Power size={16} />
                          </button>
                          {supplier.purchaseCount === 0 && (
                            <button
                              type="button"
                              onClick={() => setToDelete(supplier)}
                              disabled={isPending}
                              aria-label={`Excluir ${supplier.name}`}
                              title="Excluir"
                              className={iconButtonClass}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <Modal
          title={editing === "new" ? "Novo fornecedor" : `Editar — ${editing.name}`}
          onClose={() => setEditing(null)}
          disabled={isPending}
        >
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="supplier-name" className={labelClass}>
                Nome
              </label>
              <input id="supplier-name" type="text" maxLength={120} {...field("name")} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-document" className={labelClass}>
                CNPJ ou CPF (opcional)
              </label>
              <input id="supplier-document" type="text" maxLength={30} {...field("document")} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-phone" className={labelClass}>
                Telefone (opcional)
              </label>
              <input id="supplier-phone" type="tel" maxLength={30} {...field("phone")} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="supplier-email" className={labelClass}>
                E-mail (opcional)
              </label>
              <input id="supplier-email" type="email" maxLength={160} {...field("email")} />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="supplier-notes" className={labelClass}>
                Observações (opcional)
              </label>
              <textarea id="supplier-notes" rows={2} maxLength={500} {...field("notes")} />
            </div>
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
        title="Excluir fornecedor"
        description={`${toDelete?.name ?? "O fornecedor"} sai do cadastro. Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
