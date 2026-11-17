"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deleteBatch, saveBatch } from "@/app/actions/inventory"
import { BATCH_STATUS_LABELS } from "@/lib/constants/inventory.constants"
import type { BatchStatus } from "@repo/db"
import type { BatchDTO, BatchesDTO } from "@/lib/types/inventory"
import {
  InventoryNav,
  Modal,
  formatCalendarDate,
  formatQuantity,
  iconButtonClass,
  inputClass,
  labelClass,
  parseQuantity,
  quantityToInput,
} from "../inventory-ui"

const STATUS_CLASS: Record<BatchStatus, string> = {
  depleted: "bg-muted border-border text-muted-foreground",
  expired: "bg-destructive/10 border-destructive/20 text-destructive",
  expiring: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
  no_expiry: "bg-muted border-border text-muted-foreground",
}

const ORIGIN_LABELS = { in: "entrada", purchase: "compra" } as const

/** in_stock = resta produto · attention = vencido ou vencendo · depleted = já saiu */
type View = "in_stock" | "attention" | "depleted"

type Draft = {
  productId: string
  code: string
  manufacturedOn: string
  expiresOn: string
  quantity: string
  notes: string
}

const EMPTY: Draft = { productId: "", code: "", manufacturedOn: "", expiresOn: "", quantity: "", notes: "" }

function expiryHint(batch: BatchDTO): string | null {
  if (batch.daysToExpire === null || batch.status === "depleted") return null
  if (batch.daysToExpire < 0) {
    const days = -batch.daysToExpire
    return `venceu há ${days} ${days === 1 ? "dia" : "dias"}`
  }
  if (batch.daysToExpire === 0) return "vence hoje"
  return `vence em ${batch.daysToExpire} ${batch.daysToExpire === 1 ? "dia" : "dias"}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

/**
 * Lotes e validades (docs/ROADMAP.md, fase 4, fatia 4c).
 *
 * O lote guarda o que entrou com ele. O que RESTA é calculado a partir do saldo do
 * produto, supondo que sai primeiro o que vence primeiro — a tela não deixa editar
 * o restante, só o que entrou.
 */
export function BatchesClient({ salonId, data }: { salonId: string; data: BatchesDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [view, setView] = useState<View>("in_stock")
  /** `null` = fechado · `"new"` = lote novo · um lote = edição. */
  const [editing, setEditing] = useState<BatchDTO | "new" | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [toDelete, setToDelete] = useState<BatchDTO | null>(null)

  const inStock = useMemo(() => data.batches.filter((batch) => batch.status !== "depleted"), [data.batches])
  const visible = useMemo(() => {
    if (view === "attention") {
      return data.batches.filter((batch) => batch.status === "expired" || batch.status === "expiring")
    }
    if (view === "depleted") return data.batches.filter((batch) => batch.status === "depleted")
    return inStock
  }, [data.batches, inStock, view])

  function openNew() {
    setDraft(EMPTY)
    setEditing("new")
  }

  function openEdit(batch: BatchDTO) {
    setDraft({
      productId: batch.productId,
      code: batch.code ?? "",
      manufacturedOn: batch.manufacturedOn ?? "",
      expiresOn: batch.expiresOn ?? "",
      quantity: quantityToInput(batch.quantity),
      notes: batch.notes ?? "",
    })
    setEditing(batch)
  }

  function submit() {
    if (!editing) return

    const batchId = editing === "new" ? null : editing.id
    if (!batchId && !draft.productId) {
      toast.error("Escolha o produto")
      return
    }
    if (!draft.code.trim() && !draft.expiresOn) {
      toast.error("Informe o código do lote ou a validade")
      return
    }
    const quantity = parseQuantity(draft.quantity)
    if (quantity === null || quantity <= 0) {
      toast.error("Informe uma quantidade maior que zero")
      return
    }

    startTransition(async () => {
      const result = await saveBatch({
        salonId,
        batchId,
        productId: batchId ? null : draft.productId,
        code: draft.code.trim() || null,
        manufacturedOn: draft.manufacturedOn || null,
        expiresOn: draft.expiresOn || null,
        quantity,
        notes: draft.notes.trim() || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(batchId ? "Lote salvo" : "Lote registrado")
      setEditing(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const batch = toDelete
    if (!batch) return

    startTransition(async () => {
      const result = await deleteBatch({ salonId, batchId: batch.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Lote excluído")
      router.refresh()
    })
  }

  const set = (key: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }))

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <CalendarClock size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Lotes e validades</h2>
            <p className="text-xs text-muted-foreground">
              O que resta em cada lote é calculado pelo saldo do produto: sai primeiro o que vence primeiro.
            </p>
          </div>
        </div>
        {data.can.move && (
          <Button onClick={openNew} disabled={isPending}>
            <Plus size={16} />
            Novo lote
          </Button>
        )}
      </div>

      <InventoryNav salonId={salonId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Lotes em estoque" value={String(inStock.length)} hint="Com produto na prateleira" />
        <Stat label="Vencidos" value={String(data.expired)} hint="Com produto na prateleira" />
        <Stat label="Vencendo" value={String(data.expiring)} hint={`Nos próximos ${data.warningDays} dias`} />
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lotes</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setView("in_stock")} className={tabClass(view === "in_stock")}>
              Em estoque
            </button>
            <button type="button" onClick={() => setView("attention")} className={tabClass(view === "attention")}>
              Vencidos e vencendo ({data.expired + data.expiring})
            </button>
            <button type="button" onClick={() => setView("depleted")} className={tabClass(view === "depleted")}>
              Esgotados
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.batches.length === 0
              ? "Nenhum lote registrado. O lote pode ser informado na entrada do estoque, no item da compra, ou aqui, para o que já está na prateleira."
              : view === "attention"
                ? "Nenhum lote vencido ou vencendo."
                : "Nenhum lote nesta lista."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-left font-semibold">Lote</th>
                  <th scope="col" className="p-3 text-left font-semibold">Fabricação</th>
                  <th scope="col" className="p-3 text-left font-semibold">Validade</th>
                  <th scope="col" className="p-3 text-right font-semibold">Entrou</th>
                  <th scope="col" className="p-3 text-right font-semibold">Resta</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((batch) => {
                  const hint = expiryHint(batch)
                  return (
                    <tr key={batch.id} className={batch.status === "depleted" ? "opacity-60" : undefined}>
                      <td className="p-3 font-semibold text-foreground">
                        {batch.productName}
                        {(batch.origin || batch.notes) && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            {[batch.origin ? `veio de ${ORIGIN_LABELS[batch.origin]}` : null, batch.notes]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground">{batch.code ?? "—"}</td>
                      <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {batch.manufacturedOn ? formatCalendarDate(batch.manufacturedOn) : "—"}
                      </td>
                      <td className="p-3 tabular-nums text-foreground whitespace-nowrap">
                        {batch.expiresOn ? formatCalendarDate(batch.expiresOn) : "—"}
                        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatQuantity(batch.quantity)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground">
                        {formatQuantity(batch.remaining)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[batch.status]}`}
                        >
                          {BATCH_STATUS_LABELS[batch.status]}
                        </span>
                      </td>
                      <td className="p-2">
                        {data.can.move && (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(batch)}
                              disabled={isPending}
                              aria-label={`Editar o lote ${batch.code ?? ""} de ${batch.productName}`}
                              title="Editar"
                              className={iconButtonClass}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setToDelete(batch)}
                              disabled={isPending}
                              aria-label={`Excluir o lote ${batch.code ?? ""} de ${batch.productName}`}
                              title="Excluir"
                              className={iconButtonClass}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <Modal
          title={editing === "new" ? "Novo lote" : `Lote — ${editing.productName}`}
          onClose={() => setEditing(null)}
          disabled={isPending}
        >
          <div className="p-4 grid grid-cols-2 gap-3">
            {editing === "new" && (
              <div className="flex flex-col gap-1 col-span-2">
                <label htmlFor="batch-product" className={labelClass}>
                  Produto
                </label>
                <select
                  id="batch-product"
                  value={draft.productId}
                  disabled={isPending}
                  onChange={set("productId")}
                  className={inputClass}
                >
                  <option value="">Selecione…</option>
                  {data.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                {data.products.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Nenhum produto com controle de estoque. Ligue o controle em Produtos e saldo &gt; Configurar.
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="batch-code" className={labelClass}>
                Código do lote
              </label>
              <input
                id="batch-code"
                type="text"
                maxLength={60}
                value={draft.code}
                disabled={isPending}
                onChange={set("code")}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="batch-quantity" className={labelClass}>
                Quantidade que entrou
              </label>
              <input
                id="batch-quantity"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={draft.quantity}
                disabled={isPending}
                onChange={set("quantity")}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="batch-manufactured" className={labelClass}>
                Fabricação (opcional)
              </label>
              <input
                id="batch-manufactured"
                type="date"
                max={data.today}
                value={draft.manufacturedOn}
                disabled={isPending}
                onChange={set("manufacturedOn")}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="batch-expires" className={labelClass}>
                Validade
              </label>
              <input
                id="batch-expires"
                type="date"
                value={draft.expiresOn}
                disabled={isPending}
                onChange={set("expiresOn")}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="batch-notes" className={labelClass}>
                Observação (opcional)
              </label>
              <input
                id="batch-notes"
                type="text"
                maxLength={500}
                value={draft.notes}
                disabled={isPending}
                onChange={set("notes")}
                className={inputClass}
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              {editing === "new"
                ? "Para o que já está na prateleira. Este registro NÃO muda o saldo: para dar entrada com lote, lance a entrada em Produtos e saldo ou uma compra."
                : "Corrigir o lote não muda o saldo do produto. O que resta é recalculado."}
            </p>
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
        title="Excluir lote"
        description="O registro do lote sai da lista. O saldo do produto não muda: para tirar produto do estoque, lance uma saída."
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
