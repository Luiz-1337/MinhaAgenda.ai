"use client"

import { Fragment, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deletePurchase } from "@/app/actions/purchases"
import { PURCHASE_PAYMENT_STATUS_LABELS } from "@/lib/constants/inventory.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import type { PurchasePaymentStatus } from "@repo/db"
import type { PurchaseDTO, PurchasesDTO } from "@/lib/types/purchase"
import {
  InventoryNav,
  controlClass,
  formatCalendarDate,
  formatQuantity,
  iconButtonClass,
  labelClass,
} from "../inventory-ui"

const PAYMENT_CLASS: Record<PurchasePaymentStatus, string> = {
  none: "bg-muted border-border text-muted-foreground",
  open: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  partial: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
}

function paymentLabel(purchase: PurchaseDTO): string {
  if (purchase.paymentStatus === "partial") {
    return `Paga ${purchase.paidInstallments} de ${purchase.installments}`
  }
  if (purchase.paymentStatus === "open" && purchase.installments > 1) {
    return `A pagar em ${purchase.installments}×`
  }
  return PURCHASE_PAYMENT_STATUS_LABELS[purchase.paymentStatus]
}

/**
 * Compras (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * A compra não se edita: para corrigir, exclui-se e lança-se de novo. Excluir
 * desfaz a entrada no estoque e as parcelas ainda não pagas.
 */
export function PurchasesClient({ salonId, data }: { salonId: string; data: PurchasesDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [expanded, setExpanded] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<PurchaseDTO | null>(null)

  function applyPeriod(next: { from: string; to: string }) {
    const query = new URLSearchParams()
    if (next.from) query.set("from", next.from)
    if (next.to) query.set("to", next.to)
    const suffix = query.toString()
    startTransition(() => router.push(suffix ? `${pathname}?${suffix}` : pathname))
  }

  function confirmDelete() {
    const purchase = toDelete
    if (!purchase) return

    startTransition(async () => {
      const result = await deletePurchase({ salonId, purchaseId: purchase.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Compra excluída")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Compras</h2>
            <p className="text-xs text-muted-foreground">
              A compra dá entrada no estoque dos produtos controlados e atualiza o custo de cada produto.
            </p>
          </div>
        </div>
        {data.can.purchase && (
          <Link
            href={`/${salonId}/inventory/purchases/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            <Plus size={16} />
            Nova compra
          </Link>
        )}
      </div>

      <InventoryNav salonId={salonId} />

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="purchases-from" className={labelClass}>
                De
              </label>
              <input
                id="purchases-from"
                type="date"
                defaultValue={data.from ?? ""}
                disabled={isPending}
                onChange={(event) => applyPeriod({ from: event.target.value, to: data.to ?? "" })}
                className={controlClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="purchases-to" className={labelClass}>
                Até
              </label>
              <input
                id="purchases-to"
                type="date"
                defaultValue={data.to ?? ""}
                disabled={isPending}
                onChange={(event) => applyPeriod({ from: data.from ?? "", to: event.target.value })}
                className={controlClass}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.purchases.length} {data.purchases.length === 1 ? "compra" : "compras"} ·{" "}
            <strong className="text-foreground tabular-nums">{formatBRL(data.totalCents / 100)}</strong>
          </p>
        </div>

        {data.purchases.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.from || data.to ? "Nenhuma compra neste período." : "Nenhuma compra lançada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 w-10"><span className="sr-only">Detalhes</span></th>
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Fornecedor</th>
                  <th scope="col" className="p-3 text-right font-semibold">Itens</th>
                  <th scope="col" className="p-3 text-right font-semibold">Total</th>
                  <th scope="col" className="p-3 text-left font-semibold">Financeiro</th>
                  <th scope="col" className="p-3 w-12"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.purchases.map((purchase) => {
                  const open = expanded === purchase.id
                  return (
                    <Fragment key={purchase.id}>
                      <tr>
                        <td className="p-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : purchase.id)}
                            aria-expanded={open}
                            aria-label={open ? "Esconder os itens da compra" : "Ver os itens da compra"}
                            className={iconButtonClass}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatCalendarDate(purchase.purchasedOn)}
                        </td>
                        <td className="p-3 font-semibold text-foreground">
                          {purchase.supplierName ?? "Sem fornecedor"}
                          {purchase.invoiceNumber && (
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              NF {purchase.invoiceNumber}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{purchase.items.length}</td>
                        <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground">
                          {formatBRL(purchase.totalAmount)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${PAYMENT_CLASS[purchase.paymentStatus]}`}
                          >
                            {paymentLabel(purchase)}
                          </span>
                        </td>
                        <td className="p-2">
                          {data.can.purchase && (
                            <button
                              type="button"
                              onClick={() => setToDelete(purchase)}
                              disabled={isPending}
                              aria-label={`Excluir a compra de ${formatCalendarDate(purchase.purchasedOn)}`}
                              title="Excluir"
                              className={iconButtonClass}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-muted/30">
                          <td />
                          <td colSpan={6} className="p-3">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted-foreground">
                                  <th scope="col" className="pb-2 text-left font-semibold">Produto</th>
                                  <th scope="col" className="pb-2 text-right font-semibold">Quantidade</th>
                                  <th scope="col" className="pb-2 text-right font-semibold">Custo unitário</th>
                                  <th scope="col" className="pb-2 text-right font-semibold">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {purchase.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-1 text-foreground">{item.description}</td>
                                    <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                                      {formatQuantity(item.quantity)}
                                    </td>
                                    <td className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                                      {formatBRL(item.unitCost)}
                                    </td>
                                    <td className="py-1 text-right font-mono tabular-nums text-foreground">
                                      {formatBRL(item.totalAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className="mt-3 text-xs text-muted-foreground">
                              {[
                                Number(purchase.freightAmount) > 0 ? `Frete ${formatBRL(purchase.freightAmount)}` : null,
                                Number(purchase.discountAmount) > 0
                                  ? `Desconto ${formatBRL(purchase.discountAmount)}`
                                  : null,
                                purchase.paidCents > 0 ? `Pago ${formatBRL(purchase.paidCents / 100)}` : null,
                                purchase.userName ? `Lançada por ${purchase.userName}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {purchase.notes && <p className="mt-1 text-xs text-muted-foreground">{purchase.notes}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.truncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando as {data.purchases.length} compras mais recentes. Use o período para ver as anteriores.
          </p>
        )}
      </section>

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir compra"
        description={
          "A entrada que esta compra deu no estoque é desfeita e o custo dos produtos volta ao que era antes dela." +
          (toDelete && toDelete.installments > 0 ? " As parcelas a pagar saem do financeiro." : "") +
          " Esta ação não pode ser desfeita."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
