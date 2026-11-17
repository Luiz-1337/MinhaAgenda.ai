"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Landmark,
  Pencil,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  createFinanceTransaction,
  createFinanceTransfer,
  deleteFinanceTransaction,
  settleFinanceTransaction,
  unsettleFinanceTransaction,
  updateFinanceTransaction,
} from "@/app/actions/finance"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import { centsToNumeric } from "@repo/db/src/domain/sales"
import type {
  FinanceFormOptions,
  FinanceListFilters,
  FinanceListPage,
  FinanceTransactionDTO,
} from "@/lib/types/finance"

const controlClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all"
const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

/** "2026-11-15" → "15/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

function money(cents: number): string {
  return formatBRL(centsToNumeric(cents))
}

type OpenDialog =
  | { type: "transaction"; direction: "in" | "out"; editing: FinanceTransactionDTO | null }
  | { type: "transfer" }
  | { type: "settle"; transaction: FinanceTransactionDTO }
  | null

type TransactionDraft = {
  description: string
  amount: string
  dueDate: string
  categoryId: string
  accountId: string
  counterparty: string
  notes: string
  paid: boolean
  paidDate: string
  /** Quantos meses o lançamento se repete ("1" = não repete). Só na criação. */
  installments: string
}

type TransferDraft = { fromAccountId: string; toAccountId: string; amount: string; date: string; notes: string }

function statusBadge(row: FinanceTransactionDTO, today: string): { label: string; className: string } {
  if (row.kind === "transfer") {
    return { label: "Transferência", className: "bg-muted border-border text-muted-foreground" }
  }
  if (row.status === "paid") {
    return {
      label: row.direction === "in" ? "Recebido" : "Pago",
      className:
        "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    }
  }
  if (row.dueDate < today) {
    return { label: "Atrasado", className: "bg-destructive/10 border-destructive/20 text-destructive" }
  }
  return {
    label: row.direction === "in" ? "A receber" : "A pagar",
    className: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  }
}

export function FinanceClient({
  salonId,
  list,
  filters,
  options,
  today,
}: {
  salonId: string
  list: FinanceListPage
  filters: FinanceListFilters
  options: FinanceFormOptions
  /** O dia de hoje em Brasília, "YYYY-MM-DD". */
  today: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft | null>(null)
  const [transferDraft, setTransferDraft] = useState<TransferDraft | null>(null)
  const [settleDraft, setSettleDraft] = useState<{ accountId: string; paidDate: string }>({ accountId: "", paidDate: today })
  const [toDelete, setToDelete] = useState<FinanceTransactionDTO | null>(null)

  const activeAccounts = options.accounts.filter((account) => account.isActive)
  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize))
  const hasFilters = !!(filters.direction || filters.status || filters.from || filters.to || filters.accountId)

  // --------------------------------------------------------------------------
  // Filtros (na URL)
  // --------------------------------------------------------------------------

  function navigate(next: FinanceListFilters) {
    const params = new URLSearchParams()
    if (next.direction) params.set("direction", next.direction)
    if (next.status) params.set("status", next.status)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.accountId) params.set("account", next.accountId)
    if (next.page && next.page > 1) params.set("page", String(next.page))

    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  // Mudar um filtro volta para a primeira página.
  function setFilter(patch: Partial<FinanceListFilters>) {
    navigate({ ...filters, ...patch, page: 1 })
  }

  // --------------------------------------------------------------------------
  // Abrir diálogos
  // --------------------------------------------------------------------------

  function openTransaction(direction: "in" | "out") {
    setTransactionDraft({
      description: "",
      amount: "",
      dueDate: today,
      categoryId: "",
      accountId: activeAccounts[0]?.id ?? "",
      counterparty: "",
      notes: "",
      paid: false,
      paidDate: today,
      installments: "1",
    })
    setDialog({ type: "transaction", direction, editing: null })
  }

  function openEdit(transaction: FinanceTransactionDTO) {
    setTransactionDraft({
      description: transaction.description,
      amount: Number(transaction.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      dueDate: transaction.dueDate,
      categoryId: transaction.categoryId ?? "",
      accountId: transaction.accountId ?? "",
      counterparty: transaction.counterparty ?? "",
      notes: transaction.notes ?? "",
      paid: false,
      paidDate: today,
      installments: "1",
    })
    setDialog({ type: "transaction", direction: transaction.direction, editing: transaction })
  }

  function openTransfer() {
    setTransferDraft({
      fromAccountId: activeAccounts[0]?.id ?? "",
      toAccountId: activeAccounts[1]?.id ?? "",
      amount: "",
      date: today,
      notes: "",
    })
    setDialog({ type: "transfer" })
  }

  function openSettle(transaction: FinanceTransactionDTO) {
    setSettleDraft({ accountId: transaction.accountId ?? activeAccounts[0]?.id ?? "", paidDate: today })
    setDialog({ type: "settle", transaction })
  }

  function closeDialog() {
    if (!isPending) setDialog(null)
  }

  // --------------------------------------------------------------------------
  // Ações
  // --------------------------------------------------------------------------

  function run(successMessage: string, action: () => Promise<{ error: string } | { success: true }>, after?: () => void) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage)
      after?.()
      router.refresh()
    })
  }

  function saveTransaction() {
    if (dialog?.type !== "transaction" || !transactionDraft) return

    const amount = parseBRL(transactionDraft.amount)
    if (amount === null || amount <= 0) {
      toast.error("Informe um valor maior que zero")
      return
    }

    const editing = dialog.editing
    if (editing) {
      run(
        "Lançamento atualizado",
        () =>
          updateFinanceTransaction({
            salonId,
            transactionId: editing.id,
            description: transactionDraft.description,
            amount,
            dueDate: transactionDraft.dueDate,
            categoryId: transactionDraft.categoryId || null,
            accountId: transactionDraft.accountId || null,
            counterparty: transactionDraft.counterparty,
            notes: transactionDraft.notes,
          }),
        () => setDialog(null)
      )
      return
    }

    const installments = Number(transactionDraft.installments)
    if (!Number.isInteger(installments) || installments < 1 || installments > 60) {
      toast.error("Informe de 1 a 60 repetições")
      return
    }

    const direction = dialog.direction
    run(
      installments > 1
        ? `${installments} lançamentos criados`
        : direction === "in"
          ? "Recebimento lançado"
          : "Despesa lançada",
      () =>
        createFinanceTransaction({
          salonId,
          direction,
          description: transactionDraft.description,
          amount,
          dueDate: transactionDraft.dueDate,
          categoryId: transactionDraft.categoryId || null,
          accountId: transactionDraft.accountId || null,
          counterparty: transactionDraft.counterparty,
          notes: transactionDraft.notes,
          paid: transactionDraft.paid,
          paidDate: transactionDraft.paid ? transactionDraft.paidDate : null,
          installments,
        }),
      () => setDialog(null)
    )
  }

  function saveTransfer() {
    if (!transferDraft) return

    const amount = parseBRL(transferDraft.amount)
    if (amount === null || amount <= 0) {
      toast.error("Informe um valor maior que zero")
      return
    }
    if (!transferDraft.fromAccountId || !transferDraft.toAccountId) {
      toast.error("Selecione as contas de origem e destino")
      return
    }

    run(
      "Transferência registrada",
      () =>
        createFinanceTransfer({
          salonId,
          fromAccountId: transferDraft.fromAccountId,
          toAccountId: transferDraft.toAccountId,
          amount,
          date: transferDraft.date,
          notes: transferDraft.notes,
        }),
      () => setDialog(null)
    )
  }

  function confirmSettle() {
    if (dialog?.type !== "settle") return
    if (!settleDraft.accountId) {
      toast.error("Selecione a conta")
      return
    }

    const transactionId = dialog.transaction.id
    run(
      "Baixa registrada",
      () =>
        settleFinanceTransaction({
          salonId,
          transactionId,
          accountId: settleDraft.accountId,
          paidDate: settleDraft.paidDate,
        }),
      () => setDialog(null)
    )
  }

  function confirmDelete() {
    const transaction = toDelete
    if (!transaction) return
    run("Lançamento excluído", () => deleteFinanceTransaction(salonId, transaction.id), () => setToDelete(null))
  }

  const transactionTitle =
    dialog?.type !== "transaction"
      ? ""
      : dialog.editing
        ? "Editar lançamento"
        : dialog.direction === "in"
          ? "Novo recebimento"
          : "Nova despesa"

  const categoryKind = dialog?.type === "transaction" ? (dialog.direction === "in" ? "income" : "expense") : null
  const categoriesForDialog = options.categories.filter((category) => category.kind === categoryKind)

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="flex flex-col h-full gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Landmark size={24} className="text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Financeiro</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/${salonId}/finance/summary`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <BarChart3 size={16} />
            Resumo do mês
          </Link>
          {options.can.cash && (
            <Link
              href={`/${salonId}/finance/cash`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Wallet size={16} />
              Caixa
            </Link>
          )}
          {options.can.settings && (
            <Link
              href={`/${salonId}/finance/settings`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Settings2 size={16} />
              Contas e categorias
            </Link>
          )}
          {options.can.create && (
            <>
              <button
                onClick={openTransfer}
                disabled={activeAccounts.length < 2}
                title={activeAccounts.length < 2 ? "Cadastre ao menos duas contas para transferir" : undefined}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeftRight size={16} />
                Transferência
              </button>
              <button
                onClick={() => openTransaction("out")}
                className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
              >
                <ArrowUpRight size={16} />
                Nova despesa
              </button>
              <button
                onClick={() => openTransaction("in")}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors shadow-md"
              >
                <ArrowDownLeft size={16} />
                Novo recebimento
              </button>
            </>
          )}
        </div>
      </div>

      {/* Saldos das contas */}
      {activeAccounts.length === 0 ? (
        <div className="bg-card border border-border rounded-md p-4 text-sm text-muted-foreground flex-shrink-0">
          Nenhuma conta cadastrada. Sem conta não há saldo nem baixa.{" "}
          {options.can.settings && (
            <Link href={`/${salonId}/finance/settings`} className="text-accent font-semibold hover:underline">
              Cadastrar contas
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
          {activeAccounts.map((account) => (
            <div key={account.id} className="bg-card border border-border rounded-md p-3">
              <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground truncate">
                {account.name}
              </p>
              <p
                className={`mt-1 text-lg font-bold tabular-nums ${account.balanceCents < 0 ? "text-destructive" : "text-foreground"}`}
              >
                {money(account.balanceCents)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-3 bg-card p-3 rounded-md border border-border flex-shrink-0">
        <div className="flex flex-col gap-1">
          <label htmlFor="fin-direction" className="text-xs font-semibold text-muted-foreground">
            Tipo
          </label>
          <select
            id="fin-direction"
            value={filters.direction ?? ""}
            onChange={(event) =>
              setFilter({ direction: (event.target.value || undefined) as FinanceListFilters["direction"] })
            }
            className={controlClass}
          >
            <option value="">Entradas e saídas</option>
            <option value="in">Entradas</option>
            <option value="out">Saídas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fin-status" className="text-xs font-semibold text-muted-foreground">
            Situação
          </label>
          <select
            id="fin-status"
            value={filters.status ?? ""}
            onChange={(event) =>
              setFilter({ status: (event.target.value || undefined) as FinanceListFilters["status"] })
            }
            className={controlClass}
          >
            <option value="">Todas</option>
            <option value="open">Em aberto</option>
            <option value="paid">Baixadas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fin-account" className="text-xs font-semibold text-muted-foreground">
            Conta
          </label>
          <select
            id="fin-account"
            value={filters.accountId ?? ""}
            onChange={(event) => setFilter({ accountId: event.target.value || undefined })}
            className={controlClass}
          >
            <option value="">Todas</option>
            {options.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fin-from" className="text-xs font-semibold text-muted-foreground">
            Vence de
          </label>
          <input
            id="fin-from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => setFilter({ from: event.target.value || undefined })}
            className={controlClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fin-to" className="text-xs font-semibold text-muted-foreground">
            Até
          </label>
          <input
            id="fin-to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => setFilter({ to: event.target.value || undefined })}
            className={controlClass}
          />
        </div>
        {hasFilters && (
          <button
            onClick={() => navigate({})}
            className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Totais do filtro (transferências não entram) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: "A receber", value: list.totals.inOpen },
          { label: "Recebido", value: list.totals.inPaid },
          { label: "A pagar", value: list.totals.outOpen },
          { label: "Pago", value: list.totals.outPaid },
        ].map((total) => (
          <div key={total.label} className="bg-muted/40 border border-border rounded-md p-3">
            <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{total.label}</p>
            <p className="mt-1 text-base font-bold text-foreground tabular-nums">{money(total.value)}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div
        className={`flex-1 min-h-[240px] overflow-hidden bg-card rounded-md border border-border flex flex-col transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
        aria-busy={isPending}
      >
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-2 pl-2">Vencimento</div>
          <div className="col-span-4">Descrição</div>
          <div className="col-span-2">Conta</div>
          <div className="col-span-1">Situação</div>
          <div className="col-span-2 text-right">Valor</div>
          <div className="col-span-1" />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {list.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Landmark size={32} className="mb-3 opacity-50" />
              <p>Nenhum lançamento encontrado.</p>
            </div>
          ) : (
            list.rows.map((row, index) => {
              const badge = statusBadge(row, today)
              const detail = [row.categoryName, row.customerName, row.professionalName, row.counterparty]
                .filter(Boolean)
                .join(" · ")
              const canSettle = options.can.settle && row.status === "open"
              // Saída de comissão se desfaz em Comissões (estorno do pagamento ou
              // exclusão do vale), nunca por aqui.
              const canUnsettle =
                options.can.settle && row.status === "paid" && row.kind !== "transfer" && row.kind !== "commission"
              const canDelete =
                options.can.delete && (row.kind === "transfer" || (row.kind === "manual" && row.status === "open"))
              const canEdit = options.can.create && row.kind === "manual" && row.status === "open"

              return (
                <div
                  key={row.id}
                  className={`flex flex-col md:grid md:grid-cols-12 gap-1 md:gap-4 p-4 md:items-center border-b border-border text-sm ${
                    index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                  }`}
                >
                  <div className="md:col-span-2 md:pl-2 text-muted-foreground tabular-nums">
                    {formatDate(row.dueDate)}
                    {row.paidAt && row.kind !== "transfer" && (
                      <span className="block text-[11px]">
                        baixa {new Date(row.paidAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </span>
                    )}
                  </div>
                  <div className="md:col-span-4 min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {row.saleId ? (
                        <Link href={`/${salonId}/sales/${row.saleId}`} className="hover:underline">
                          {row.description}
                        </Link>
                      ) : (
                        row.description
                      )}
                    </p>
                    {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
                  </div>
                  <div className="md:col-span-2 text-muted-foreground text-xs truncate">
                    {row.accountName ?? "Sem conta"}
                  </div>
                  <div className="md:col-span-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="md:col-span-2 md:text-right">
                    <p
                      className={`font-mono font-medium tabular-nums ${
                        row.direction === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                      }`}
                    >
                      {row.direction === "in" ? "+ " : "− "}
                      {formatBRL(row.netAmount)}
                    </p>
                    {Number(row.feeAmount) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        bruto {formatBRL(row.amount)} · taxa {formatBRL(row.feeAmount)}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-1 flex md:justify-end gap-1">
                    {canSettle && (
                      <button
                        onClick={() => openSettle(row)}
                        disabled={isPending}
                        className="p-2 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                        aria-label={`Dar baixa em ${row.description}`}
                        title="Dar baixa"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => openEdit(row)}
                        disabled={isPending}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={`Editar ${row.description}`}
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {canUnsettle && (
                      <button
                        onClick={() =>
                          run("Baixa estornada", () => unsettleFinanceTransaction(salonId, row.id))
                        }
                        disabled={isPending}
                        className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label={`Estornar a baixa de ${row.description}`}
                        title="Estornar baixa"
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setToDelete(row)}
                        disabled={isPending}
                        className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        aria-label={`Excluir ${row.description}`}
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {list.total > list.pageSize && (
          <div className="flex items-center justify-between gap-3 p-3 border-t border-border text-xs text-muted-foreground">
            <span>
              {list.total} lançamentos · página {list.page} de {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate({ ...filters, page: list.page - 1 })}
                disabled={list.page <= 1 || isPending}
                className="p-2 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => navigate({ ...filters, page: list.page + 1 })}
                disabled={list.page >= totalPages || isPending}
                className="p-2 rounded-md hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                aria-label="Próxima página"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Novo recebimento / Nova despesa */}
      <Dialog open={dialog?.type === "transaction"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          className="!max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{transactionTitle}</DialogTitle>
          <DialogHeader title={transactionTitle} onClose={closeDialog} disabled={isPending} />

          {transactionDraft && dialog?.type === "transaction" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="ft-description" className={labelClass}>
                  Descrição
                </label>
                <input
                  id="ft-description"
                  type="text"
                  maxLength={200}
                  value={transactionDraft.description}
                  onChange={(event) => setTransactionDraft({ ...transactionDraft, description: event.target.value })}
                  placeholder={dialog.direction === "in" ? "Ex: Aluguel de cadeira" : "Ex: Conta de luz"}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="ft-amount" className={labelClass}>
                    Valor (R$)
                  </label>
                  <input
                    id="ft-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={transactionDraft.amount}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, amount: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ft-due" className={labelClass}>
                    Vencimento
                  </label>
                  <input
                    id="ft-due"
                    type="date"
                    value={transactionDraft.dueDate}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, dueDate: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="ft-category" className={labelClass}>
                    Categoria
                  </label>
                  <select
                    id="ft-category"
                    value={transactionDraft.categoryId}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, categoryId: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Sem categoria</option>
                    {categoriesForDialog.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ft-account" className={labelClass}>
                    Conta
                  </label>
                  <select
                    id="ft-account"
                    value={transactionDraft.accountId}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, accountId: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Sem conta</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ft-counterparty" className={labelClass}>
                  {dialog.direction === "in" ? "Recebido de (opcional)" : "Pago a (opcional)"}
                </label>
                <input
                  id="ft-counterparty"
                  type="text"
                  maxLength={120}
                  value={transactionDraft.counterparty}
                  onChange={(event) => setTransactionDraft({ ...transactionDraft, counterparty: event.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ft-notes" className={labelClass}>
                  Observações (opcional)
                </label>
                <textarea
                  id="ft-notes"
                  rows={2}
                  maxLength={1000}
                  value={transactionDraft.notes}
                  onChange={(event) => setTransactionDraft({ ...transactionDraft, notes: event.target.value })}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {/* Repetição e "já pago" só na criação. Na edição o lançamento está em
                  aberto por definição, e as parcelas já criadas são independentes. */}
              {!dialog.editing && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <label htmlFor="ft-installments" className={labelClass}>
                    Repetir por (meses)
                  </label>
                  <input
                    id="ft-installments"
                    type="number"
                    min={1}
                    max={60}
                    step={1}
                    value={transactionDraft.installments}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, installments: event.target.value })}
                    className={inputClass}
                    aria-describedby="ft-installments-hint"
                  />
                  <p id="ft-installments-hint" className="text-[11px] text-muted-foreground">
                    1 = não repete. Acima disso, cria um lançamento por mês a partir do vencimento.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <Checkbox
                    aria-label={dialog.direction === "in" ? "Já recebido" : "Já pago"}
                    checked={transactionDraft.paid}
                    onChange={(event) => setTransactionDraft({ ...transactionDraft, paid: event.target.checked })}
                  />
                  {dialog.direction === "in" ? "Já recebido" : "Já pago"}
                </label>
                {transactionDraft.paid && (
                  <div className="space-y-1.5">
                    <label htmlFor="ft-paid-date" className={labelClass}>
                      Data da baixa
                    </label>
                    <input
                      id="ft-paid-date"
                      type="date"
                      max={today}
                      value={transactionDraft.paidDate}
                      onChange={(event) => setTransactionDraft({ ...transactionDraft, paidDate: event.target.value })}
                      className={inputClass}
                    />
                    {!transactionDraft.accountId && (
                      <p className="text-xs text-destructive">Escolha a conta para registrar a baixa.</p>
                    )}
                    {Number(transactionDraft.installments) > 1 && (
                      <p className="text-xs text-muted-foreground">
                        A baixa vale só para o primeiro lançamento; os próximos ficam em aberto.
                      </p>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>
          )}

          <DialogFooter onCancel={closeDialog} onConfirm={saveTransaction} pending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Transferência */}
      <Dialog open={dialog?.type === "transfer"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          className="!max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Transferência entre contas</DialogTitle>
          <DialogHeader title="Transferência entre contas" onClose={closeDialog} disabled={isPending} />

          {transferDraft && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="tr-from" className={labelClass}>
                    De
                  </label>
                  <select
                    id="tr-from"
                    value={transferDraft.fromAccountId}
                    onChange={(event) => setTransferDraft({ ...transferDraft, fromAccountId: event.target.value })}
                    className={inputClass}
                  >
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="tr-to" className={labelClass}>
                    Para
                  </label>
                  <select
                    id="tr-to"
                    value={transferDraft.toAccountId}
                    onChange={(event) => setTransferDraft({ ...transferDraft, toAccountId: event.target.value })}
                    className={inputClass}
                  >
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="tr-amount" className={labelClass}>
                    Valor (R$)
                  </label>
                  <input
                    id="tr-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={transferDraft.amount}
                    onChange={(event) => setTransferDraft({ ...transferDraft, amount: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="tr-date" className={labelClass}>
                    Data
                  </label>
                  <input
                    id="tr-date"
                    type="date"
                    max={today}
                    value={transferDraft.date}
                    onChange={(event) => setTransferDraft({ ...transferDraft, date: event.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tr-notes" className={labelClass}>
                  Observações (opcional)
                </label>
                <input
                  id="tr-notes"
                  type="text"
                  maxLength={1000}
                  value={transferDraft.notes}
                  onChange={(event) => setTransferDraft({ ...transferDraft, notes: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <DialogFooter onCancel={closeDialog} onConfirm={saveTransfer} pending={isPending} />
        </DialogContent>
      </Dialog>

      {/* Dar baixa */}
      <Dialog open={dialog?.type === "settle"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          className="!max-w-md max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Dar baixa</DialogTitle>
          <DialogHeader title="Dar baixa" onClose={closeDialog} disabled={isPending} />

          {dialog?.type === "settle" && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{dialog.transaction.description}</p>
                <p className="text-sm text-muted-foreground">
                  {formatBRL(dialog.transaction.netAmount)} · vence {formatDate(dialog.transaction.dueDate)}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="st-account" className={labelClass}>
                  Conta
                </label>
                <select
                  id="st-account"
                  value={settleDraft.accountId}
                  onChange={(event) => setSettleDraft({ ...settleDraft, accountId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Selecione…</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="st-date" className={labelClass}>
                  Data da baixa
                </label>
                <input
                  id="st-date"
                  type="date"
                  max={today}
                  value={settleDraft.paidDate}
                  onChange={(event) => setSettleDraft({ ...settleDraft, paidDate: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <DialogFooter onCancel={closeDialog} onConfirm={confirmSettle} pending={isPending} confirmLabel="Confirmar baixa" />
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={toDelete?.kind === "transfer" ? "Excluir transferência" : "Excluir lançamento"}
        description={
          toDelete?.kind === "transfer"
            ? "A saída e a entrada desta transferência serão excluídas juntas, e o saldo das duas contas volta ao que era. Esta ação não pode ser desfeita."
            : `Excluir "${toDelete?.description}"? Esta ação não pode ser desfeita.`
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}

function DialogHeader({ title, onClose, disabled }: { title: string; onClose: () => void; disabled: boolean }) {
  return (
    <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
      <h2 className="text-lg font-bold text-foreground tracking-tight">{title}</h2>
      <button
        onClick={onClose}
        disabled={disabled}
        className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
        aria-label="Fechar"
      >
        <X size={20} />
      </button>
    </div>
  )
}

function DialogFooter({
  onCancel,
  onConfirm,
  pending,
  confirmLabel = "Salvar",
}: {
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
  confirmLabel?: string
}) {
  return (
    <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        Cancelar
      </button>
      <Button onClick={onConfirm} size="lg" loading={pending} className="font-bold shadow-md">
        {!pending && <Save size={18} />}
        {pending ? "Salvando..." : confirmLabel}
      </Button>
    </div>
  )
}
