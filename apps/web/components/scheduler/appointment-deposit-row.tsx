"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HandCoins } from "lucide-react"
import {
  createAppointmentDeposit,
  deleteAppointmentDeposit,
  getAppointmentDeposit,
  settleAppointmentDeposit,
} from "@/app/actions/appointment-deposits"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import { DEPOSIT_STATUS_LABELS, type DepositAction, type DepositStatus } from "@repo/db/src/domain/appointment-deposits"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const STATUS_CLASS: Record<DepositStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  received: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  waived: "bg-muted text-muted-foreground",
}

const linkClass = "text-xs font-semibold text-accent hover:underline disabled:opacity-50 disabled:no-underline"

/**
 * O sinal no detalhe do agendamento (docs/ROADMAP.md, fase 8, fatia 8a).
 *
 * O sistema não recebe o dinheiro: o cliente paga por PIX direto ao salão, e
 * quem atende marca aqui que recebeu. Sem sinal e sem permissão de editar, a
 * linha não aparece.
 */
export function AppointmentDepositRow({ salonId, appointmentId }: { salonId: string; appointmentId: string }) {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState("")

  const queryKey = ["appointment-deposit", salonId, appointmentId]
  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAppointmentDeposit({ salonId, appointmentId })
      if ("error" in result) throw new Error(result.error)
      return result
    },
  })

  if (!data) return null
  const { deposit } = data
  const canManage = data.can.manage
  if (!deposit && !canManage) return null

  function run(message: string, action: () => Promise<{ error: string } | unknown>) {
    startTransition(async () => {
      const result = await action()
      if (result && typeof result === "object" && "error" in result) {
        toast.error(String(result.error))
        return
      }
      toast.success(message)
      setAdding(false)
      void queryClient.invalidateQueries({ queryKey })
    })
  }

  function settle(action: DepositAction, message: string) {
    run(message, () => settleAppointmentDeposit({ salonId, appointmentId, action }))
  }

  function create() {
    const value = parseBRL(amount)
    if (value === null || value <= 0) {
      toast.error("Informe o valor do sinal")
      return
    }
    run("Sinal lançado", () =>
      createAppointmentDeposit({ salonId, appointmentId, amountCents: Math.round(value * 100) })
    )
  }

  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-muted-foreground">
        <HandCoins size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">Sinal</p>

        {deposit ? (
          <>
            <p className="text-foreground">
              {formatBRL(deposit.amountCents / 100)}
              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[deposit.status]}`}>
                {DEPOSIT_STATUS_LABELS[deposit.status]}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {deposit.source === "online" ? "Pedido pela página de agendamento" : "Lançado no painel"}
              {deposit.status === "received" && deposit.receivedAt
                ? ` · recebido em ${dateTimeFormat.format(new Date(deposit.receivedAt))}`
                : ""}
              {deposit.status !== "pending" && deposit.settledByName ? ` · por ${deposit.settledByName}` : ""}
            </p>
            {deposit.appliedSale && (
              <p className="text-xs text-muted-foreground">
                Abatido na{" "}
                <Link href={`/${salonId}/sales/${deposit.appliedSale.id}`} className="font-semibold text-accent hover:underline">
                  comanda #{deposit.appliedSale.number}
                </Link>
              </p>
            )}
            {canManage && !deposit.appliedSale && (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {deposit.status !== "received" && (
                  <button type="button" disabled={isPending} onClick={() => settle("receive", "Sinal recebido")} className={linkClass}>
                    Marcar como recebido
                  </button>
                )}
                {deposit.status === "pending" && (
                  <>
                    <button type="button" disabled={isPending} onClick={() => settle("waive", "Sinal dispensado")} className={linkClass}>
                      Dispensar
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run("Sinal tirado", () => deleteAppointmentDeposit({ salonId, appointmentId }))}
                      className={linkClass}
                    >
                      Tirar o sinal
                    </button>
                  </>
                )}
                {deposit.status !== "pending" && (
                  <button type="button" disabled={isPending} onClick={() => settle("reopen", "Sinal reaberto")} className={linkClass}>
                    Voltar para aguardando
                  </button>
                )}
              </div>
            )}
          </>
        ) : adding ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={isPending}
              placeholder="0,00"
              aria-label="Valor do sinal"
              onChange={(event) => setAmount(event.target.value)}
              className="w-28 px-2 py-1 bg-background border border-border rounded-md text-sm text-foreground disabled:opacity-50"
            />
            <button type="button" disabled={isPending} onClick={create} className={linkClass}>
              Lançar
            </button>
            <button type="button" disabled={isPending} onClick={() => setAdding(false)} className="text-xs text-muted-foreground hover:underline">
              Voltar
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setAmount(data.suggestedCents ? (data.suggestedCents / 100).toFixed(2).replace(".", ",") : "")
              setAdding(true)
            }}
            className={linkClass}
          >
            Lançar sinal
          </button>
        )}
      </div>
    </div>
  )
}
