"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, PackageMinus, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { createStockRequest, decideStockRequest, deleteStockRequest } from "@/app/actions/inventory"
import { STOCK_REQUEST_STATUS_LABELS } from "@/lib/constants/inventory.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import type { StockRequestStatus } from "@repo/db"
import type { StockRequestDTO, StockRequestsDTO } from "@/lib/types/inventory"
import {
  InventoryNav,
  Modal,
  formatQuantity,
  iconButtonClass,
  inputClass,
  labelClass,
  parseQuantity,
} from "../inventory-ui"

const STATUS_CLASS: Record<StockRequestStatus, string> = {
  pending: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  approved:
    "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-muted border-border text-muted-foreground",
}

type View = "pending" | "all"

/** O que a confirmação vai fazer: aprovar, recusar ou excluir uma solicitação. */
type Pending = { action: "approve" | "reject" | "delete"; request: StockRequestDTO }

function describe(request: StockRequestDTO): string {
  return `${formatQuantity(request.quantity)} × ${request.description} para ${request.professionalName}`
}

/**
 * Solicitações de saída de estoque (docs/ROADMAP.md, fase 4, fatia 4e).
 *
 * O profissional pede um produto para uso próprio. Aprovar tira o produto do
 * estoque e, com as comissões ligadas, debita o valor no extrato dele.
 */
export function RequestsClient({ salonId, data }: { salonId: string; data: StockRequestsDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [view, setView] = useState<View>(data.pending > 0 ? "pending" : "all")
  const [creating, setCreating] = useState(false)
  const [productId, setProductId] = useState("")
  const [professionalId, setProfessionalId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState<Pending | null>(null)

  const visible = useMemo(
    () => (view === "pending" ? data.requests.filter((request) => request.status === "pending") : data.requests),
    [data.requests, view]
  )

  const product = data.products.find((option) => option.id === productId)
  const typedQuantity = parseQuantity(quantity)
  const priceCents = product?.professionalPrice ? Math.round(Number(product.professionalPrice) * 100) : 0
  const totalCents =
    typedQuantity !== null && typedQuantity > 0 ? Math.round((Math.round(typedQuantity * 1000) * priceCents) / 1000) : 0

  function openNew() {
    setProductId("")
    // Quem só pode pedir para si já abre com o próprio nome.
    setProfessionalId(data.professionals.length === 1 ? data.professionals[0].id : "")
    setQuantity("1")
    setNotes("")
    setCreating(true)
  }

  function submit() {
    if (!productId) {
      toast.error("Escolha o produto")
      return
    }
    if (!professionalId) {
      toast.error("Escolha o profissional")
      return
    }
    if (typedQuantity === null || typedQuantity <= 0) {
      toast.error("Informe uma quantidade maior que zero")
      return
    }

    startTransition(async () => {
      const result = await createStockRequest({
        salonId,
        productId,
        professionalId,
        quantity: typedQuantity,
        notes: notes.trim() || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Solicitação registrada")
      setCreating(false)
      setView("pending")
      router.refresh()
    })
  }

  function confirm() {
    const current = confirming
    if (!current) return

    startTransition(async () => {
      const result =
        current.action === "delete"
          ? await deleteStockRequest({ salonId, requestId: current.request.id })
          : await decideStockRequest({ salonId, requestId: current.request.id, approve: current.action === "approve" })

      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        current.action === "approve"
          ? "Solicitação aprovada"
          : current.action === "reject"
            ? "Solicitação recusada"
            : "Solicitação excluída"
      )
      router.refresh()
    })
  }

  function confirmText(current: Pending): { title: string; description: string; button: string } {
    const { request } = current
    const hasValue = Number(request.totalAmount) > 0

    if (current.action === "approve") {
      return {
        title: "Aprovar solicitação",
        description:
          `${describe(request)}. O produto sai do estoque` +
          (hasValue && data.commissionsEnabled
            ? ` e ${formatBRL(request.totalAmount)} são debitados nas comissões de ${request.professionalName}.`
            : hasValue
              ? ". Este salão não usa comissões: o valor não é debitado."
              : ". Sem preço para profissional: nada é debitado."),
        button: "Aprovar",
      }
    }
    if (current.action === "reject") {
      return {
        title: "Recusar solicitação",
        description: `${describe(request)}. Nada sai do estoque e nada é debitado.`,
        button: "Recusar",
      }
    }
    return {
      title: "Excluir solicitação",
      description:
        request.status === "approved"
          ? `${describe(request)}. O produto volta para o estoque` +
            (request.hasDebit ? " e o débito sai do extrato de comissões." : ".") +
            " Esta ação não pode ser desfeita."
          : `${describe(request)}. Esta ação não pode ser desfeita.`,
      button: "Excluir",
    }
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
    }`

  const text = confirming ? confirmText(confirming) : null

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <PackageMinus size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Solicitações de estoque</h2>
            <p className="text-xs text-muted-foreground">
              Produto retirado pelo profissional para uso próprio.
              {data.commissionsEnabled && " Aprovada, a retirada é debitada nas comissões pelo preço para profissional."}
            </p>
          </div>
        </div>
        {data.can.request && (
          <Button onClick={openNew} disabled={isPending}>
            <Plus size={16} />
            Nova solicitação
          </Button>
        )}
      </div>

      {/* Quem só solicita não tem as outras telas do estoque. */}
      {data.can.access && <InventoryNav salonId={salonId} />}

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Solicitações</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setView("pending")} className={tabClass(view === "pending")}>
              Pendentes ({data.pending})
            </button>
            <button type="button" onClick={() => setView("all")} className={tabClass(view === "all")}>
              Todas
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {view === "pending" ? "Nenhuma solicitação aguardando decisão." : "Nenhuma solicitação registrada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-right font-semibold">Qtde</th>
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 w-32"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((request) => {
                  // Quem só solicita exclui as próprias pendentes; aprovada com
                  // débito já pago não se exclui (o servidor confere de novo).
                  const canDelete = data.can.move
                    ? !(request.status === "approved" && request.debitPaid)
                    : data.can.request && request.status === "pending"

                  return (
                    <tr key={request.id}>
                      <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(request.createdAt).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {request.requestedByName && (
                          <span className="block text-[11px]">por {request.requestedByName}</span>
                        )}
                      </td>
                      <td className="p-3 font-semibold text-foreground">
                        {request.description}
                        {request.notes && (
                          <span className="block text-[11px] font-normal text-muted-foreground">{request.notes}</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatQuantity(request.quantity)}
                      </td>
                      <td className="p-3 text-muted-foreground">{request.professionalName}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-foreground whitespace-nowrap">
                        {Number(request.totalAmount) > 0 ? formatBRL(request.totalAmount) : "—"}
                        {request.debitPaid && (
                          <span className="block font-sans text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Debitado e pago
                          </span>
                        )}
                        {request.hasDebit && !request.debitPaid && (
                          <span className="block font-sans text-[11px] text-muted-foreground">Debitado nas comissões</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[request.status]}`}
                        >
                          {STOCK_REQUEST_STATUS_LABELS[request.status]}
                        </span>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-end gap-1">
                          {data.can.move && request.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirming({ action: "approve", request })}
                                disabled={isPending}
                                aria-label={`Aprovar a solicitação de ${describe(request)}`}
                                title="Aprovar"
                                className={iconButtonClass}
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirming({ action: "reject", request })}
                                disabled={isPending}
                                aria-label={`Recusar a solicitação de ${describe(request)}`}
                                title="Recusar"
                                className={iconButtonClass}
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setConfirming({ action: "delete", request })}
                              disabled={isPending}
                              aria-label={`Excluir a solicitação de ${describe(request)}`}
                              title="Excluir"
                              className={iconButtonClass}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.truncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando as {data.requests.length} solicitações mais recentes.
          </p>
        )}
      </section>

      {creating && (
        <Modal title="Nova solicitação" onClose={() => setCreating(false)} disabled={isPending}>
          <div className="p-4 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="request-product" className={labelClass}>
                Produto
              </label>
              <select
                id="request-product"
                value={productId}
                disabled={isPending}
                onChange={(event) => setProductId(event.target.value)}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {data.products.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {data.products.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum produto disponível para solicitação. Quem gerencia o estoque marca o produto em Produtos e
                  saldo &gt; Configurar.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="request-professional" className={labelClass}>
                Profissional
              </label>
              <select
                id="request-professional"
                value={professionalId}
                disabled={isPending || data.professionals.length === 1}
                onChange={(event) => setProfessionalId(event.target.value)}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {data.professionals.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {data.professionals.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Seu usuário não está ligado a um profissional deste salão.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="request-quantity" className={labelClass}>
                Quantidade
              </label>
              <input
                id="request-quantity"
                type="text"
                inputMode="decimal"
                value={quantity}
                disabled={isPending}
                onChange={(event) => setQuantity(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label htmlFor="request-notes" className={labelClass}>
                Observação (opcional)
              </label>
              <input
                id="request-notes"
                type="text"
                maxLength={500}
                value={notes}
                disabled={isPending}
                onChange={(event) => setNotes(event.target.value)}
                className={inputClass}
              />
            </div>
            {product && (
              <p className="col-span-2 text-sm text-muted-foreground">
                {priceCents > 0 ? (
                  <>
                    Preço para profissional: {formatBRL(priceCents / 100)} ·{" "}
                    <strong className="text-foreground">Total {formatBRL(totalCents / 100)}</strong>
                    {data.commissionsEnabled && " — debitado nas comissões quando a solicitação for aprovada."}
                  </>
                ) : (
                  "Este produto não tem preço para profissional: nada é debitado."
                )}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              Solicitar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        onConfirm={confirm}
        title={text?.title ?? ""}
        description={text?.description ?? ""}
        confirmText={text?.button ?? "Confirmar"}
        type={confirming?.action === "approve" ? "warning" : "danger"}
      />
    </div>
  )
}
