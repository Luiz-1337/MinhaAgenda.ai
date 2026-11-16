"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { createCommissionAdjustment, deleteCommissionAdjustment } from "@/app/actions/commissions"
import { COMMISSION_ADJUSTMENT_KIND_LABELS } from "@/lib/constants/commissions.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { CommissionAdjustmentKind } from "@repo/db"
import type { CommissionAdjustmentDTO } from "@/lib/types/commission"

const KINDS = Object.keys(COMMISSION_ADJUSTMENT_KIND_LABELS) as CommissionAdjustmentKind[]

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
const labelClass = "text-xs font-semibold text-muted-foreground"

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/**
 * Vales e bonificações do período (docs/ROADMAP.md, fase 3, fatia 3c).
 *
 * Vale abate o que o profissional tem a receber; bonificação soma. Não há edição:
 * corrigir é excluir e lançar de novo, para o extrato nunca mudar sem deixar rastro
 * de quem lançou.
 *
 * Um vale pode registrar de qual conta o dinheiro saiu (fatia 3d): vira uma despesa
 * paga no financeiro. Lançamento que já entrou num pagamento não se exclui.
 */
export function CommissionAdjustments({
  salonId,
  adjustments,
  truncated,
  professionals,
  defaultProfessionalId,
  today,
  accounts,
  canAdjust,
}: {
  salonId: string
  adjustments: CommissionAdjustmentDTO[]
  truncated: boolean
  professionals: { id: string; name: string }[]
  /** O profissional filtrado no extrato, se houver: o formulário já abre nele. */
  defaultProfessionalId: string | null
  /** Hoje em Brasília ("YYYY-MM-DD"), vindo do servidor. */
  today: string
  /** Contas de onde um vale pode sair. Vazio = a pessoa não lança no financeiro. */
  accounts: { id: string; name: string }[]
  canAdjust: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [formOpen, setFormOpen] = useState(false)
  const [professionalId, setProfessionalId] = useState(defaultProfessionalId ?? professionals[0]?.id ?? "")
  const [kind, setKind] = useState<CommissionAdjustmentKind>("advance")
  const [referenceDate, setReferenceDate] = useState(today)
  const [amount, setAmount] = useState("")
  const [notes, setNotes] = useState("")
  const [accountId, setAccountId] = useState("")
  const [toDelete, setToDelete] = useState<CommissionAdjustmentDTO | null>(null)

  // Só o vale tira dinheiro na hora; a bonificação sai junto com a comissão.
  const offersAccount = kind === "advance" && accounts.length > 0

  function submit() {
    if (!professionalId) {
      toast.error("Escolha o profissional")
      return
    }
    const value = parseBRL(amount)
    if (value === null || value <= 0) {
      toast.error("Informe um valor maior que zero")
      return
    }
    if (!referenceDate) {
      toast.error("Informe a data")
      return
    }

    startTransition(async () => {
      const result = await createCommissionAdjustment({
        salonId,
        professionalId,
        kind,
        amount: value,
        referenceDate,
        notes: notes.trim() || null,
        accountId: offersAccount && accountId ? accountId : null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(`${COMMISSION_ADJUSTMENT_KIND_LABELS[kind]} lançado${kind === "bonus" ? "a" : ""}`)
      setAmount("")
      setNotes("")
      setFormOpen(false)
      router.refresh()
    })
  }

  function confirmDelete() {
    const target = toDelete
    if (!target) return

    startTransition(async () => {
      const result = await deleteCommissionAdjustment({ salonId, adjustmentId: target.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Lançamento excluído")
      router.refresh()
    })
  }

  return (
    <section className="bg-card border border-border rounded-md">
      <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Vales e bonificações</h3>
        {canAdjust && professionals.length > 0 && (
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            disabled={isPending}
            aria-expanded={formOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-60"
          >
            {formOpen ? <X size={14} /> : <Plus size={14} />}
            {formOpen ? "Cancelar" : "Lançar"}
          </button>
        )}
      </div>

      {formOpen && (
        <div className="p-4 border-b border-border grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-3 flex flex-col gap-1">
            <label htmlFor="adjustment-professional" className={labelClass}>
              Profissional
            </label>
            <select
              id="adjustment-professional"
              value={professionalId}
              disabled={isPending}
              onChange={(event) => setProfessionalId(event.target.value)}
              className={inputClass}
            >
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label htmlFor="adjustment-kind" className={labelClass}>
              Tipo
            </label>
            <select
              id="adjustment-kind"
              value={kind}
              disabled={isPending}
              onChange={(event) => setKind(event.target.value as CommissionAdjustmentKind)}
              className={inputClass}
            >
              {KINDS.map((value) => (
                <option key={value} value={value}>
                  {COMMISSION_ADJUSTMENT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label htmlFor="adjustment-date" className={labelClass}>
              Entra no extrato em
            </label>
            <input
              id="adjustment-date"
              type="date"
              value={referenceDate}
              disabled={isPending}
              onChange={(event) => setReferenceDate(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-2 flex flex-col gap-1">
            <label htmlFor="adjustment-amount" className={labelClass}>
              Valor
            </label>
            <input
              id="adjustment-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              disabled={isPending}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-3 flex flex-col gap-1">
            <label htmlFor="adjustment-notes" className={labelClass}>
              Observação (opcional)
            </label>
            <input
              id="adjustment-notes"
              type="text"
              maxLength={500}
              value={notes}
              disabled={isPending}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClass}
            />
          </div>
          {offersAccount && (
            <div className="md:col-span-4 flex flex-col gap-1">
              <label htmlFor="adjustment-account" className={labelClass}>
                Saiu de qual conta? (opcional)
              </label>
              <select
                id="adjustment-account"
                value={accountId}
                disabled={isPending}
                onChange={(event) => setAccountId(event.target.value)}
                className={inputClass}
              >
                <option value="">Não registrar no financeiro</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className={`${offersAccount ? "md:col-span-5" : "md:col-span-9"} text-xs text-muted-foreground`}>
            {kind === "advance"
              ? "O vale abate o que o profissional tem a receber a partir da data escolhida."
              : "A bonificação soma ao que o profissional tem a receber e sai junto com o pagamento da comissão."}{" "}
            {kind === "advance" &&
              (offersAccount && accountId
                ? "A saída entra como despesa paga no financeiro."
                : "Sem conta, nada é lançado no financeiro.")}
          </p>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={submit} disabled={isPending}>
              <Plus size={16} />
              Lançar {COMMISSION_ADJUSTMENT_KIND_LABELS[kind].toLowerCase()}
            </Button>
          </div>
        </div>
      )}

      {adjustments.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum vale ou bonificação no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="p-3 text-left font-semibold">Data</th>
                <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                <th scope="col" className="p-3 text-left font-semibold">Observação</th>
                <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                {canAdjust && <th scope="col" className="p-3 w-12"><span className="sr-only">Ações</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adjustments.map((adjustment) => (
                <tr key={adjustment.id}>
                  <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                    {formatDate(adjustment.referenceDate)}
                  </td>
                  <td className="p-3 text-foreground">{adjustment.professionalName}</td>
                  <td className="p-3 text-muted-foreground">
                    {COMMISSION_ADJUSTMENT_KIND_LABELS[adjustment.kind]}
                    {adjustment.accountName && (
                      <span className="block text-[11px]">saiu de {adjustment.accountName}</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{adjustment.notes ?? "—"}</td>
                  <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                    {adjustment.kind === "advance" ? "− " : "+ "}
                    {formatBRL(adjustment.amount)}
                    {adjustment.paidOn && (
                      <span className="block font-sans text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        No pagamento de {formatDate(adjustment.paidOn)}
                      </span>
                    )}
                  </td>
                  {canAdjust && (
                    <td className="p-2 text-right">
                      {/* O que já entrou num pagamento só sai estornando o pagamento. */}
                      {!adjustment.paidOn && (
                        <button
                          type="button"
                          onClick={() => setToDelete(adjustment)}
                          disabled={isPending}
                          className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                          aria-label={`Excluir ${COMMISSION_ADJUSTMENT_KIND_LABELS[adjustment.kind].toLowerCase()} de ${adjustment.professionalName} em ${formatDate(adjustment.referenceDate)}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {truncated && (
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          Mostrando os {adjustments.length} lançamentos mais recentes. Os totais são do período inteiro.
        </p>
      )}

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir lançamento"
        description={
          toDelete
            ? `${COMMISSION_ADJUSTMENT_KIND_LABELS[toDelete.kind]} de ${formatBRL(toDelete.amount)} de ${toDelete.professionalName} sai do extrato${toDelete.accountName ? `, e a despesa lançada em ${toDelete.accountName} sai do financeiro` : ""}. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmText="Excluir"
        type="danger"
      />
    </section>
  )
}
