"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Lock, Save, Unlock, Wallet, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { addCashMovement, closeCashSession, openCashSession } from "@/app/actions/cash"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import { centsToNumeric, toCents } from "@repo/db/src/domain/sales"
import type { CashMovementDTO, CashOverview } from "@/lib/types/cash"

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})
const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})

function money(cents: number): string {
  return formatBRL(centsToNumeric(cents))
}

const MOVEMENT_LABELS: Record<CashMovementDTO["kind"], string> = {
  supply: "Suprimento",
  withdrawal: "Sangria",
  sale: "Venda em dinheiro",
}

type OpenDialog = { type: "supply" } | { type: "withdrawal" } | { type: "close" } | null

export function CashClient({ salonId, overview }: { salonId: string; overview: CashOverview }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [openingAmount, setOpeningAmount] = useState("")
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")

  const { open, history, canOperate } = overview

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

  function openDialog(next: NonNullable<OpenDialog>) {
    setAmount("")
    setDescription("")
    setDialog(next)
  }

  function closeDialog() {
    if (!isPending) setDialog(null)
  }

  function handleOpenCash() {
    // Campo vazio = abre sem troco.
    const parsed = openingAmount.trim() === "" ? 0 : parseBRL(openingAmount)
    if (parsed === null || parsed < 0) {
      toast.error("Informe o saldo inicial do caixa")
      return
    }
    run("Caixa aberto", () => openCashSession({ salonId, openingAmount: parsed }))
  }

  function confirmDialog() {
    if (!dialog) return

    const parsed = parseBRL(amount)

    if (dialog.type === "close") {
      if (parsed === null || parsed < 0) {
        toast.error("Informe o valor contado no caixa")
        return
      }
      run(
        "Caixa fechado",
        () => closeCashSession({ salonId, countedAmount: parsed, notes: description }),
        () => setDialog(null)
      )
      return
    }

    if (parsed === null || parsed <= 0) {
      toast.error("Informe um valor maior que zero")
      return
    }

    const kind = dialog.type
    run(
      kind === "supply" ? "Suprimento registrado" : "Sangria registrada",
      () => addCashMovement({ salonId, kind, amount: parsed, description }),
      () => setDialog(null)
    )
  }

  // Diferença ao vivo no fechamento: contado − esperado.
  const countedCents = dialog?.type === "close" && amount.trim() !== "" ? toCents(parseBRL(amount)) : null
  const differenceCents = open && countedCents !== null ? countedCents - open.expectedCents : null

  const dialogTitle =
    dialog?.type === "supply" ? "Suprimento" : dialog?.type === "withdrawal" ? "Sangria" : "Fechar caixa"

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/${salonId}/finance`}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Voltar para o financeiro"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Wallet size={20} className="text-accent" />
              Caixa
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${
                  open
                    ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {open ? "Aberto" : "Fechado"}
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              {open
                ? `Aberto em ${dateTimeFormat.format(new Date(open.openedAt))}${open.openedByName ? ` por ${open.openedByName}` : ""}`
                : "O dinheiro vivo da gaveta: o que entrou, o que saiu e se bateu no fim do dia."}
            </p>
          </div>
        </div>

        {open && canOperate && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openDialog({ type: "supply" })}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
            >
              <ArrowDownLeft size={16} />
              Suprimento
            </button>
            <button
              onClick={() => openDialog({ type: "withdrawal" })}
              className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-foreground rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
            >
              <ArrowUpRight size={16} />
              Sangria
            </button>
            <button
              onClick={() => openDialog({ type: "close" })}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors shadow-md"
            >
              <Lock size={16} />
              Fechar caixa
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4 space-y-6">
        {!open ? (
          <section className="bg-card border border-border rounded-md p-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Não há caixa aberto. Com o caixa aberto, toda comanda paga em dinheiro entra nele sozinha.
            </p>
            {canOperate ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5 sm:w-56">
                  <label htmlFor="cash-opening" className={labelClass}>
                    Saldo inicial (R$)
                  </label>
                  <input
                    id="cash-opening"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={openingAmount}
                    onChange={(event) => setOpeningAmount(event.target.value)}
                    className={inputClass}
                    aria-describedby="cash-opening-hint"
                  />
                </div>
                <Button onClick={handleOpenCash} loading={isPending} size="lg" className="font-bold shadow-md">
                  {!isPending && <Unlock size={18} />}
                  Abrir caixa
                </Button>
                <p id="cash-opening-hint" className="text-xs text-muted-foreground sm:pb-3">
                  O troco que já está na gaveta. Pode ser zero.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Você não tem permissão para abrir o caixa.</p>
            )}
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: "Saldo inicial", value: open.openingCents },
                { label: "Vendas em dinheiro", value: open.saleCents },
                { label: "Suprimentos", value: open.supplyCents },
                { label: "Sangrias", value: open.withdrawalCents },
              ].map((stat) => (
                <div key={stat.label} className="bg-muted/40 border border-border rounded-md p-3">
                  <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-base font-bold text-foreground tabular-nums">{money(stat.value)}</p>
                </div>
              ))}
              <div className="bg-card border border-border rounded-md p-3 col-span-2 lg:col-span-1">
                <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                  Esperado na gaveta
                </p>
                <p className="mt-1 text-lg font-bold text-foreground tabular-nums">{money(open.expectedCents)}</p>
              </div>
            </div>

            <section className="space-y-3">
              <h3 className={labelClass}>Movimentos</h3>
              {open.movements.length === 0 ? (
                <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
                  Nenhum movimento neste caixa ainda.
                </div>
              ) : (
                <div className="bg-card border border-border rounded-md divide-y divide-border">
                  {open.movements.map((movement) => {
                    const isOut = movement.kind === "withdrawal"
                    const detail =
                      movement.kind === "sale"
                        ? [movement.saleNumber ? `Comanda #${movement.saleNumber}` : null, movement.customerName]
                            .filter(Boolean)
                            .join(" · ")
                        : movement.description

                    return (
                      <div key={movement.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {movement.kind === "sale" && movement.saleId ? (
                              <Link href={`/${salonId}/sales/${movement.saleId}`} className="hover:underline">
                                {MOVEMENT_LABELS[movement.kind]}
                              </Link>
                            ) : (
                              MOVEMENT_LABELS[movement.kind]
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {timeFormat.format(new Date(movement.createdAt))}
                            {detail ? ` · ${detail}` : ""}
                            {movement.createdByName ? ` · ${movement.createdByName}` : ""}
                          </p>
                        </div>
                        <span
                          className={`font-mono font-medium tabular-nums flex-shrink-0 ${
                            isOut ? "text-foreground" : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {isOut ? "− " : "+ "}
                          {formatBRL(movement.amount)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </>
        )}

        {/* Histórico */}
        <section className="space-y-3">
          <h3 className={labelClass}>Caixas fechados</h3>
          {history.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              Nenhum caixa fechado ainda.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border bg-muted/50">
                    <th scope="col" className="p-3 text-left font-semibold">
                      Abertura
                    </th>
                    <th scope="col" className="p-3 text-left font-semibold">
                      Fechamento
                    </th>
                    <th scope="col" className="p-3 text-left font-semibold">
                      Operador
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Inicial
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Esperado
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Contado
                    </th>
                    <th scope="col" className="p-3 text-right font-semibold">
                      Diferença
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((session) => {
                    const difference = Number(session.difference ?? 0)
                    return (
                      <tr key={session.id}>
                        <td className="p-3 tabular-nums text-foreground">
                          {dateTimeFormat.format(new Date(session.openedAt))}
                        </td>
                        <td className="p-3 tabular-nums text-muted-foreground">
                          {session.closedAt ? dateTimeFormat.format(new Date(session.closedAt)) : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground">{session.openedByName ?? "—"}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{formatBRL(session.openingAmount)}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{formatBRL(session.expectedAmount)}</td>
                        <td className="p-3 text-right font-mono tabular-nums">{formatBRL(session.countedAmount)}</td>
                        <td
                          className={`p-3 text-right font-mono tabular-nums font-semibold ${
                            difference < 0
                              ? "text-destructive"
                              : difference > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-foreground"
                          }`}
                        >
                          {difference === 0 ? "Bateu" : `${difference > 0 ? "Sobra " : "Falta "}${formatBRL(Math.abs(difference))}`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {overview.historyTotal > history.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando os {history.length} mais recentes de {overview.historyTotal}.
            </p>
          )}
        </section>
      </div>

      <Dialog open={dialog !== null} onOpenChange={(isOpen) => !isOpen && closeDialog()}>
        <DialogContent className="!max-w-md bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
          <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
          <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
            <h2 className="text-lg font-bold text-foreground tracking-tight">{dialogTitle}</h2>
            <button
              onClick={closeDialog}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          {dialog && (
            <div className="p-5 space-y-4">
              {dialog.type === "close" && open && (
                <p className="text-sm text-muted-foreground">
                  Esperado na gaveta: <span className="font-semibold text-foreground">{money(open.expectedCents)}</span>.
                  Conte o dinheiro e informe o total.
                </p>
              )}
              {dialog.type === "withdrawal" && open && (
                <p className="text-sm text-muted-foreground">
                  Em caixa agora: <span className="font-semibold text-foreground">{money(open.expectedCents)}</span>.
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="cash-amount" className={labelClass}>
                  {dialog.type === "close" ? "Valor contado (R$)" : "Valor (R$)"}
                </label>
                <input
                  id="cash-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={inputClass}
                />
              </div>

              {dialog.type === "close" && differenceCents !== null && (
                <p
                  role="status"
                  className={`text-sm font-semibold ${
                    differenceCents === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : differenceCents < 0
                        ? "text-destructive"
                        : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {differenceCents === 0
                    ? "Bateu com o esperado."
                    : differenceCents > 0
                      ? `Sobra de ${money(differenceCents)}`
                      : `Falta de ${money(-differenceCents)}`}
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="cash-description" className={labelClass}>
                  {dialog.type === "close" ? "Observações (opcional)" : "Motivo (opcional)"}
                </label>
                <input
                  id="cash-description"
                  type="text"
                  maxLength={200}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={
                    dialog.type === "supply"
                      ? "Ex: troco"
                      : dialog.type === "withdrawal"
                        ? "Ex: depósito no banco"
                        : ""
                  }
                  className={inputClass}
                />
              </div>
            </div>
          )}

          <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
            <button
              type="button"
              onClick={closeDialog}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button onClick={confirmDialog} size="lg" loading={isPending} className="font-bold shadow-md">
              {!isPending && <Save size={18} />}
              {isPending ? "Salvando..." : dialog?.type === "close" ? "Fechar caixa" : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
