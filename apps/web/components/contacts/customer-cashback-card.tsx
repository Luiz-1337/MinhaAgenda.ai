"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { adjustCashback, getCustomerCashback } from "@/app/actions/cashback"
import { useSalon } from "@/contexts/salon-context"
import {
  CASHBACK_ENTRY_LABELS,
  CASHBACK_STATUS_CLASSES,
  CASHBACK_STATUS_LABELS,
} from "@/lib/constants/cashback.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { CashbackEntryDTO } from "@/lib/types/cashback"

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const fieldClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"

/** A coluna "Motivo" do extrato: de onde veio o movimento. */
function entryReason(entry: CashbackEntryDTO): string {
  if (entry.kind === "adjustment") return entry.reason ?? "Ajuste manual"
  if (entry.kind === "redeem") return "Usado na comanda"
  return entry.itemDescription ?? "Compra"
}

/**
 * Cashback na ficha do cliente (docs/ROADMAP.md, fase 6, fatia 6a): o saldo, a
 * situação e o extrato — "Data, Valor, Movimentação, Motivo" na Belasis —, com o
 * ajuste manual para quem gerencia.
 *
 * Não renderiza NADA no salão sem o módulo de cashback ou para quem não tem acesso
 * a ele — a ficha continua igual à de antes.
 */
export function CustomerCashbackCard({ salonId, customerId }: { salonId: string; customerId: string }) {
  const { activeSalon } = useSalon()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  const [adjusting, setAdjusting] = useState(false)
  const [direction, setDirection] = useState<"credit" | "debit">("credit")
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")

  const enabled =
    !!activeSalon &&
    activeSalon.id === salonId &&
    activeSalon.modules.includes("cashback") &&
    activeSalon.permissions.includes("cashback.access")

  const queryKey = ["customer-cashback", salonId, customerId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getCustomerCashback(salonId, customerId)
      if ("error" in res) throw new Error(res.error)
      return res
    },
    enabled,
  })

  if (!enabled) return null

  function submitAdjustment() {
    const value = parseBRL(amount)
    if (value === null || value <= 0) {
      toast.error("Informe o valor do ajuste")
      return
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste")
      return
    }

    startTransition(async () => {
      const result = await adjustCashback({
        salonId,
        customerId,
        amount: direction === "credit" ? value : -value,
        reason: reason.trim(),
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Ajuste lançado")
      setAdjusting(false)
      setAmount("")
      setReason("")
      await queryClient.invalidateQueries({ queryKey })
    })
  }

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-foreground">Cashback</h3>
        {data?.can.manage && !adjusting && (
          <button
            type="button"
            onClick={() => setAdjusting(true)}
            className="text-xs font-bold text-accent hover:underline"
          >
            Ajustar saldo
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Carregando…</p>
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground py-2">Não foi possível carregar o cashback.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xl font-bold tabular-nums text-foreground">{formatBRL(data.balance)}</p>
            <span
              className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold ${CASHBACK_STATUS_CLASSES[data.status]}`}
            >
              {CASHBACK_STATUS_LABELS[data.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.isEnabled
              ? `Mínimo para resgate: ${formatBRL(data.minRedeem)}. O uso é no faturamento da comanda.`
              : "O cashback está desativado no salão: o saldo fica guardado, mas não pode ser usado."}
          </p>

          {adjusting && (
            <div className="mt-3 border border-border rounded-md p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="cashback-adjust-direction" className="text-[11px] font-semibold text-muted-foreground">
                    Movimento
                  </label>
                  <select
                    id="cashback-adjust-direction"
                    value={direction}
                    disabled={isPending}
                    onChange={(event) => setDirection(event.target.value as "credit" | "debit")}
                    className={fieldClass}
                  >
                    <option value="credit">Creditar</option>
                    <option value="debit">Debitar</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="cashback-adjust-amount" className="text-[11px] font-semibold text-muted-foreground">
                    Valor (R$)
                  </label>
                  <input
                    id="cashback-adjust-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    disabled={isPending}
                    onChange={(event) => setAmount(event.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="cashback-adjust-reason" className="text-[11px] font-semibold text-muted-foreground">
                  Motivo
                </label>
                <input
                  id="cashback-adjust-reason"
                  type="text"
                  maxLength={200}
                  value={reason}
                  disabled={isPending}
                  onChange={(event) => setReason(event.target.value)}
                  className={fieldClass}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAdjusting(false)}
                  disabled={isPending}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submitAdjustment}
                  disabled={isPending}
                  className="text-xs font-bold text-accent hover:underline disabled:opacity-50"
                >
                  Lançar ajuste
                </button>
              </div>
            </div>
          )}

          {data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 mt-2">Nenhum movimento de cashback.</p>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {data.entries.map((entry) => (
                <div key={entry.id} className="py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      <span className="font-semibold">{CASHBACK_ENTRY_LABELS[entry.kind]}</span> · {entryReason(entry)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {dateFormat.format(new Date(entry.createdAt))}
                      {entry.saleId && entry.saleNumber !== null && (
                        <>
                          {" · "}
                          <Link href={`/${salonId}/sales/${entry.saleId}`} className="text-accent hover:underline">
                            Comanda #{entry.saleNumber}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={`flex-shrink-0 font-mono text-sm tabular-nums ${
                      Number(entry.amount) < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                    }`}
                  >
                    {Number(entry.amount) < 0 ? "− " : "+ "}
                    {formatBRL(Math.abs(Number(entry.amount)))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
