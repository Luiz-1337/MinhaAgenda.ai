"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, CreditCard, Pencil, Plus, Save, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { deletePaymentMethod, savePaymentMethod } from "@/app/actions/payment-methods"
import { PAYMENT_METHOD_KIND_LABELS } from "@/lib/constants/sales.constants"
import { parseBRL } from "@/lib/utils/money.utils"
import type { PaymentMethodKind } from "@repo/db"
import type { PaymentMethodDTO } from "@/lib/types/sale"

const KINDS = Object.keys(PAYMENT_METHOD_KIND_LABELS) as PaymentMethodKind[]

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

type Draft = {
  id?: string
  name: string
  kind: PaymentMethodKind
  feePercent: string
  settlementDays: string
  isActive: boolean
}

const EMPTY_DRAFT: Draft = { name: "", kind: "pix", feePercent: "0", settlementDays: "0", isActive: true }

function formatPercent(value: string): string {
  return `${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`
}

function formatSettlement(days: number): string {
  if (days === 0) return "Na hora"
  return days === 1 ? "1 dia" : `${days} dias`
}

export function PaymentMethodsClient({
  salonId,
  methods,
  canManage,
}: {
  salonId: string
  methods: PaymentMethodDTO[]
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [toDelete, setToDelete] = useState<PaymentMethodDTO | null>(null)

  function openEdit(method: PaymentMethodDTO) {
    setDraft({
      id: method.id,
      name: method.name,
      kind: method.kind,
      feePercent: Number(method.feePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
      settlementDays: String(method.settlementDays),
      isActive: method.isActive,
    })
  }

  function save() {
    if (!draft) return

    const feePercent = parseBRL(draft.feePercent)
    const settlementDays = Number(draft.settlementDays)

    if (feePercent === null || feePercent < 0 || feePercent > 100) {
      toast.error("Informe a taxa entre 0 e 100%")
      return
    }
    if (!Number.isInteger(settlementDays) || settlementDays < 0 || settlementDays > 365) {
      toast.error("Informe o prazo em dias, de 0 a 365")
      return
    }

    startTransition(async () => {
      const result = await savePaymentMethod({
        salonId,
        id: draft.id,
        name: draft.name,
        kind: draft.kind,
        feePercent,
        settlementDays,
        isActive: draft.isActive,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      toast.success(draft.id ? "Forma de pagamento atualizada" : "Forma de pagamento criada")
      setDraft(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const method = toDelete
    if (!method) return

    startTransition(async () => {
      const result = await deletePaymentMethod(salonId, method.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Forma de pagamento excluída")
      setToDelete(null)
      router.refresh()
    })
  }

  const title = draft?.id ? "Editar forma de pagamento" : "Nova forma de pagamento"

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex justify-between items-center flex-shrink-0 gap-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/${salonId}/salon-settings`}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Voltar para as configurações do salão"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <CreditCard size={20} className="text-accent" />
              Formas de pagamento
            </h2>
            <p className="text-xs text-muted-foreground">
              Taxa e prazo valem para as próximas comandas; as já faturadas não mudam.
            </p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={() => setDraft(EMPTY_DRAFT)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-bold shadow-md transition-all"
          >
            <Plus size={16} />
            Nova forma
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4">
        {methods.length === 0 ? (
          <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
            Nenhuma forma de pagamento cadastrada. Cadastre ao menos uma para faturar comandas.
          </div>
        ) : (
          <div className="bg-card border border-border rounded-md divide-y divide-border">
            <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-4">Nome</div>
              <div className="col-span-2">Tipo</div>
              <div className="col-span-2">Taxa</div>
              <div className="col-span-2">Recebimento</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1" />
            </div>
            {methods.map((method) => (
              <div
                key={method.id}
                className="flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 p-4 md:items-center text-sm"
              >
                <div className="md:col-span-4 font-semibold text-foreground truncate">{method.name}</div>
                <div className="md:col-span-2 text-muted-foreground">{PAYMENT_METHOD_KIND_LABELS[method.kind]}</div>
                <div className="md:col-span-2 text-foreground tabular-nums">
                  <span className="md:hidden text-xs text-muted-foreground">Taxa: </span>
                  {formatPercent(method.feePercent)}
                </div>
                <div className="md:col-span-2 text-foreground">
                  <span className="md:hidden text-xs text-muted-foreground">Recebimento: </span>
                  {formatSettlement(method.settlementDays)}
                </div>
                <div className="md:col-span-1">
                  <span
                    className={
                      method.isActive
                        ? "inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                        : "inline-flex items-center px-2 py-0.5 rounded-full bg-muted border border-border text-xs font-bold text-muted-foreground"
                    }
                  >
                    {method.isActive ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="md:col-span-1 flex md:justify-end gap-1">
                  {canManage && (
                    <>
                      <button
                        onClick={() => openEdit(method)}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={`Editar ${method.name}`}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setToDelete(method)}
                        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Excluir ${method.name}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && !isPending && setDraft(null)}>
        <DialogContent
          className="!max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
            <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
            <button
              onClick={() => setDraft(null)}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          {draft && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="pm-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="pm-name"
                  type="text"
                  maxLength={60}
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Ex: Crédito à vista"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="pm-kind" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="pm-kind"
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as PaymentMethodKind })}
                  className={inputClass}
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {PAYMENT_METHOD_KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="pm-fee" className={labelClass}>
                    Taxa (%)
                  </label>
                  <input
                    id="pm-fee"
                    type="text"
                    inputMode="decimal"
                    value={draft.feePercent}
                    onChange={(event) => setDraft({ ...draft, feePercent: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pm-days" className={labelClass}>
                    Recebimento (dias)
                  </label>
                  <input
                    id="pm-days"
                    type="number"
                    min={0}
                    max={365}
                    step={1}
                    value={draft.settlementDays}
                    onChange={(event) => setDraft({ ...draft, settlementDays: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <Switch
                  checked={draft.isActive}
                  onCheckedChange={(checked) => setDraft({ ...draft, isActive: checked })}
                />
                Ativa (aparece ao faturar)
              </label>
            </div>
          )}

          <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button onClick={save} size="lg" loading={isPending} className="font-bold shadow-md">
              {!isPending && <Save size={18} />}
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir forma de pagamento"
        description={`Excluir "${toDelete?.name}"? Só é possível se ela nunca foi usada em uma comanda; nesse caso, desative.`}
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
