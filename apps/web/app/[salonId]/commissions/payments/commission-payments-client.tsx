"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, HandCoins, Printer, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { payCommissions, undoCommissionPayment } from "@/app/actions/commissions"
import { formatBRL } from "@/lib/utils/money.utils"
import type { CommissionPaymentDTO, CommissionPaymentsDTO } from "@/lib/types/commission"

const controlClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all disabled:opacity-60"
const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
const labelClass = "text-xs font-semibold text-muted-foreground"

function money(cents: number): string {
  return formatBRL(cents / 100)
}

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/**
 * Pagamento de comissões (docs/ROADMAP.md, fase 3, fatia 3d).
 *
 * Em cima, o que está EM ABERTO até a data de corte — sem data inicial, de
 * propósito: o que ficou para trás (um vale maior que a comissão do mês) aparece
 * aqui até ser quitado. Quem tem líquido negativo não entra no pagamento.
 *
 * Embaixo, os pagamentos feitos no período, com recibo e estorno.
 */
export function CommissionPaymentsClient({ salonId, data }: { salonId: string; data: CommissionPaymentsDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // Só quem tem algo a quitar e não está devendo pode entrar no lote.
  const payable = useMemo(() => data.open.filter((row) => row.netCents >= 0), [data.open])

  const [selected, setSelected] = useState<Set<string>>(() => new Set(payable.map((row) => row.professionalId)))
  const [paidOn, setPaidOn] = useState(data.today)
  const [accountId, setAccountId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [toUndo, setToUndo] = useState<CommissionPaymentDTO | null>(null)

  const chosen = payable.filter((row) => selected.has(row.professionalId))
  const chosenCents = chosen.reduce((sum, row) => sum + row.netCents, 0)

  function navigate(next: { until: string; from: string; to: string }) {
    const params = new URLSearchParams(next)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  function toggle(professionalId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(professionalId)) next.delete(professionalId)
      else next.add(professionalId)
      return next
    })
  }

  function askToPay() {
    if (chosen.length === 0) {
      toast.error("Escolha ao menos um profissional")
      return
    }
    if (!paidOn) {
      toast.error("Informe o dia do pagamento")
      return
    }
    setConfirming(true)
  }

  function pay() {
    startTransition(async () => {
      const result = await payCommissions({
        salonId,
        cutoffDate: data.until,
        paidOn,
        notes: notes.trim() || null,
        accountId: accountId || null,
        categoryId: accountId && categoryId ? categoryId : null,
        professionals: chosen.map((row) => ({ professionalId: row.professionalId, expectedCents: row.netCents })),
      })
      if ("error" in result) {
        toast.error(result.error)
        // O motivo mais comum é a soma ter mudado: a tela precisa mostrar a nova.
        router.refresh()
        return
      }
      toast.success(
        result.data && result.data.payments > 1
          ? `${result.data.payments} pagamentos registrados`
          : "Pagamento registrado"
      )
      setNotes("")
      router.refresh()
    })
  }

  function undo() {
    const target = toUndo
    if (!target) return

    startTransition(async () => {
      const result = await undoCommissionPayment({ salonId, paymentId: target.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Pagamento estornado")
      router.refresh()
    })
  }

  const receiptHref = (payment: CommissionPaymentDTO) =>
    `/${salonId}/commissions/payments/receipt?payment=${payment.id}`
  const batchHref = (payment: CommissionPaymentDTO) =>
    `/${salonId}/commissions/payments/receipt?batch=${payment.batchId}`

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link
          href={`/${salonId}/commissions`}
          aria-label="Voltar para as comissões"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <HandCoins size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Pagamento de comissões</h2>
          <p className="text-xs text-muted-foreground">
            Paga de uma vez tudo o que está em aberto: comissões liberadas, menos vales, mais bonificações.
          </p>
        </div>
      </div>

      {/* Em aberto */}
      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Em aberto</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="payments-until" className={labelClass}>
              Até
            </label>
            <input
              id="payments-until"
              type="date"
              value={data.until}
              disabled={isPending}
              onChange={(event) => {
                // Campo limpo não navega: o servidor cairia em hoje e o campo
                // voltaria preenchido, sem a pessoa entender por quê.
                if (event.target.value) navigate({ until: event.target.value, from: data.from, to: data.to })
              }}
              className={controlClass}
            />
          </div>
        </div>

        {data.open.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nada em aberto até {formatDate(data.until)}. Comissão que aguarda o cliente pagar não entra aqui.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  {data.canPay && <th scope="col" className="p-3 w-10"><span className="sr-only">Pagar</span></th>}
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-right font-semibold">Comissões</th>
                  <th scope="col" className="p-3 text-right font-semibold">Vales</th>
                  <th scope="col" className="p-3 text-right font-semibold">Bonificações</th>
                  <th scope="col" className="p-3 text-right font-semibold">A pagar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.open.map((row) => {
                  const owing = row.netCents < 0
                  return (
                    <tr key={row.professionalId}>
                      {data.canPay && (
                        <td className="p-3">
                          {!owing && (
                            <input
                              type="checkbox"
                              checked={selected.has(row.professionalId)}
                              disabled={isPending}
                              onChange={() => toggle(row.professionalId)}
                              aria-label={`Pagar ${row.professionalName}`}
                              className="h-4 w-4 accent-foreground"
                            />
                          )}
                        </td>
                      )}
                      <td className="p-3 font-semibold text-foreground">
                        {row.professionalName}
                        {owing && (
                          <span className="block text-[11px] font-normal text-destructive">
                            Devendo: os vales passam do que há a receber. Fica para o próximo pagamento.
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                        {money(row.entriesCents)}
                        <span className="block font-sans text-[11px]">
                          {row.entriesCount} {row.entriesCount === 1 ? "item" : "itens"}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.advanceCents > 0 ? `− ${money(row.advanceCents)}` : "—"}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                        {row.bonusCents > 0 ? `+ ${money(row.bonusCents)}` : "—"}
                      </td>
                      <td
                        className={`p-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          owing ? "text-destructive" : "text-foreground"
                        }`}
                      >
                        {money(row.netCents)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.canPay && payable.length > 0 && (
          <div className="p-4 border-t border-border grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-2 flex flex-col gap-1">
              <label htmlFor="payment-date" className={labelClass}>
                Dia do pagamento
              </label>
              <input
                id="payment-date"
                type="date"
                max={data.today}
                value={paidOn}
                disabled={isPending}
                onChange={(event) => setPaidOn(event.target.value)}
                className={inputClass}
              />
            </div>
            {data.finance.accounts.length > 0 && (
              <div className="md:col-span-3 flex flex-col gap-1">
                <label htmlFor="payment-account" className={labelClass}>
                  Saiu de qual conta? (opcional)
                </label>
                <select
                  id="payment-account"
                  value={accountId}
                  disabled={isPending}
                  onChange={(event) => setAccountId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Não registrar no financeiro</option>
                  {data.finance.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {accountId && data.finance.categories.length > 0 && (
              <div className="md:col-span-3 flex flex-col gap-1">
                <label htmlFor="payment-category" className={labelClass}>
                  Categoria da despesa (opcional)
                </label>
                <select
                  id="payment-category"
                  value={categoryId}
                  disabled={isPending}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem categoria</option>
                  {data.finance.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="md:col-span-4 flex flex-col gap-1">
              <label htmlFor="payment-notes" className={labelClass}>
                Observação (opcional)
              </label>
              <input
                id="payment-notes"
                type="text"
                maxLength={500}
                value={notes}
                disabled={isPending}
                onChange={(event) => setNotes(event.target.value)}
                className={inputClass}
              />
            </div>
            <p className="md:col-span-8 text-xs text-muted-foreground">
              O pagamento quita tudo o que está em aberto até {formatDate(data.until)} para cada profissional marcado.{" "}
              {accountId
                ? "Cada pagamento entra como despesa paga no financeiro."
                : "Sem conta, nada é lançado no financeiro."}
            </p>
            <div className="md:col-span-4 flex justify-end">
              <Button onClick={askToPay} disabled={isPending || chosen.length === 0}>
                <HandCoins size={16} />
                Pagar {money(chosenCents)}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Pagas */}
      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Pagas · {money(data.paidCents)} no período
          </h3>
          <div className="flex items-center gap-2">
            <label htmlFor="payments-from" className={labelClass}>
              De
            </label>
            <input
              id="payments-from"
              type="date"
              value={data.from}
              disabled={isPending}
              onChange={(event) => {
                if (event.target.value) navigate({ until: data.until, from: event.target.value, to: data.to })
              }}
              className={controlClass}
            />
            <label htmlFor="payments-to" className={labelClass}>
              Até
            </label>
            <input
              id="payments-to"
              type="date"
              value={data.to}
              disabled={isPending}
              onChange={(event) => {
                if (event.target.value) navigate({ until: data.until, from: data.from, to: event.target.value })
              }}
              className={controlClass}
            />
          </div>
        </div>

        {data.payments.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum pagamento no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-left font-semibold">Pagamento</th>
                  <th scope="col" className="p-3 text-right font-semibold">Comissões</th>
                  <th scope="col" className="p-3 text-right font-semibold">Vales</th>
                  <th scope="col" className="p-3 text-right font-semibold">Bonificações</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor pago</th>
                  <th scope="col" className="p-3 w-28"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatDate(payment.paidOn)}
                      <span className="block text-[11px]">em aberto até {formatDate(payment.cutoffDate)}</span>
                    </td>
                    <td className="p-3 font-semibold text-foreground">
                      {payment.professionalName}
                      {payment.notes && (
                        <span className="block text-[11px] font-normal text-muted-foreground">{payment.notes}</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {payment.accountName ?? "Sem lançamento no financeiro"}
                      {payment.userName && <span className="block text-[11px]">por {payment.userName}</span>}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {formatBRL(payment.entriesAmount)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {Number(payment.advancesAmount) > 0 ? `− ${formatBRL(payment.advancesAmount)}` : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                      {Number(payment.bonusesAmount) > 0 ? `+ ${formatBRL(payment.bonusesAmount)}` : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                      {formatBRL(payment.amount)}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={receiptHref(payment)}
                          target="_blank"
                          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          aria-label={`Recibo de ${payment.professionalName} de ${formatDate(payment.paidOn)}`}
                          title="Recibo"
                        >
                          <Printer size={16} />
                        </Link>
                        {payment.batchSize > 1 && (
                          <Link
                            href={batchHref(payment)}
                            target="_blank"
                            className="px-2 py-1 rounded-md text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors whitespace-nowrap"
                            title={`Os ${payment.batchSize} recibos do lote, numa impressão só`}
                          >
                            Lote ({payment.batchSize})
                          </Link>
                        )}
                        {data.canPay && (
                          <button
                            type="button"
                            onClick={() => setToUndo(payment)}
                            disabled={isPending}
                            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                            aria-label={`Estornar o pagamento de ${payment.professionalName} de ${formatDate(payment.paidOn)}`}
                            title="Estornar"
                          >
                            <Undo2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.paymentsTruncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando os {data.payments.length} pagamentos mais recentes. O total é do período inteiro.
          </p>
        )}
      </section>

      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={pay}
        title="Pagar comissões"
        description={`${money(chosenCents)} para ${chosen.length} ${
          chosen.length === 1 ? "profissional" : "profissionais"
        }, quitando o que está em aberto até ${formatDate(data.until)}.${
          accountId ? " A saída entra no financeiro." : " Nada é lançado no financeiro."
        }`}
        confirmText="Pagar"
        type="warning"
      />

      <ConfirmModal
        open={toUndo !== null}
        onClose={() => setToUndo(null)}
        onConfirm={undo}
        title="Estornar pagamento"
        description={
          toUndo
            ? `O pagamento de ${formatBRL(toUndo.amount)} a ${toUndo.professionalName} é apagado e tudo o que ele quitou volta a ficar em aberto.${
                toUndo.accountName ? ` A despesa lançada em ${toUndo.accountName} sai do financeiro.` : ""
              }`
            : ""
        }
        confirmText="Estornar"
        type="danger"
      />
    </div>
  )
}
