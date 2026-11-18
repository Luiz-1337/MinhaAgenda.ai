"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, History } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { CashbackHistoryDTO, CashbackHistoryEntryDTO } from "@/lib/types/cashback"
import { controlClass, formatCalendarDate, labelClass } from "../../inventory/inventory-ui"

type Kind = CashbackHistoryEntryDTO["kind"]

const KIND_LABEL: Record<Kind, string> = {
  earn: "Gerado",
  redeem: "Resgatado",
  adjustment: "Ajuste",
}

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

/** Centavos com sinal → "R$ 10,00", "− R$ 10,00". */
function signedBRL(cents: number): string {
  return cents < 0 ? `− ${formatBRL(-cents / 100)}` : formatBRL(cents / 100)
}

/** numeric com sinal → "+ R$ 10,00" ou "− R$ 10,00". */
function entryAmount(amount: string): string {
  const value = Number(amount)
  return value < 0 ? `− ${formatBRL(-value)}` : `+ ${formatBRL(value)}`
}

/**
 * Relatório "Histórico de cashback" (docs/ROADMAP.md, fase 6, fatia 6f): todos os
 * lançamentos do período, de todos os clientes, com os totais.
 *
 * O período vive na URL (`?from=&to=`), pelo dia do lançamento.
 */
export function CashbackHistoryClient({ salonId, data }: { salonId: string; data: CashbackHistoryDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [kind, setKind] = useState<"all" | Kind>("all")
  const [search, setSearch] = useState("")

  function navigate(next: { from: string; to: string }) {
    const params = new URLSearchParams(next)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.entries.filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false
      if (term && !entry.customerName.toLowerCase().includes(term)) return false
      return true
    })
  }, [data.entries, kind, search])

  const { summary } = data

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col gap-2 flex-shrink-0">
        <Link
          href={`/${salonId}/cashback`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground self-start"
        >
          <ArrowLeft size={14} />
          Voltar para o cashback
        </Link>
        <div className="flex items-center gap-2">
          <History size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Histórico de cashback</h2>
            <p className="text-xs text-muted-foreground">
              Tudo o que entrou e saiu do saldo dos clientes no período: o que as comandas geraram, o que foi usado e
              os ajustes feitos à mão.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="cashback-history-from" className={labelClass}>
            De
          </label>
          <input
            id="cashback-history-from"
            type="date"
            defaultValue={data.from}
            disabled={isPending}
            onChange={(event) => {
              // Campo limpo não navega: o servidor cairia no mês corrente e o campo
              // voltaria preenchido, sem o usuário entender por quê.
              if (event.target.value) navigate({ from: event.target.value, to: data.to })
            }}
            className={controlClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="cashback-history-to" className={labelClass}>
            Até
          </label>
          <input
            id="cashback-history-to"
            type="date"
            defaultValue={data.to}
            disabled={isPending}
            onChange={(event) => {
              if (event.target.value) navigate({ from: data.from, to: event.target.value })
            }}
            className={controlClass}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:pb-2.5">
          Lançamentos de {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Gerado" value={signedBRL(summary.earnedCents)} hint="Crédito que as comandas renderam" />
        <Stat label="Resgatado" value={signedBRL(summary.redeemedCents)} hint="Crédito usado para pagar comandas" />
        <Stat label="Ajustes" value={signedBRL(summary.adjustmentCents)} hint="Lançados à mão na ficha do cliente" />
        <Stat
          label="Variação do saldo"
          value={signedBRL(summary.netCents)}
          hint={`${summary.entries} ${summary.entries === 1 ? "lançamento" : "lançamentos"} no período`}
        />
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:mr-auto">Lançamentos</h3>
          <input
            type="search"
            aria-label="Buscar por cliente"
            placeholder="Cliente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={controlClass}
          />
          <select
            aria-label="Filtrar por tipo"
            value={kind}
            onChange={(event) => setKind(event.target.value as "all" | Kind)}
            className={controlClass}
          >
            <option value="all">Todos os tipos</option>
            <option value="earn">Gerado</option>
            <option value="redeem">Resgatado</option>
            <option value="adjustment">Ajuste</option>
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.entries.length === 0
              ? "Nenhum lançamento de cashback no período."
              : "Nenhum lançamento com esses filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                  <th scope="col" className="p-3 text-left font-semibold">Origem</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((entry) => {
                  const negative = Number(entry.amount) < 0
                  return (
                    <tr key={entry.id} className="align-top">
                      <td className="p-3 tabular-nums">{dateTimeFormat.format(new Date(entry.createdAt))}</td>
                      <td className="p-3 font-semibold text-foreground">
                        <Link href={`/${salonId}/contacts/${entry.customerId}`} className="hover:underline">
                          {entry.customerName}
                        </Link>
                      </td>
                      <td className="p-3">{KIND_LABEL[entry.kind]}</td>
                      <td className="p-3 text-muted-foreground">
                        {entry.itemDescription ?? entry.reason ?? "—"}
                        {entry.saleId && entry.saleNumber !== null && (
                          <Link
                            href={`/${salonId}/sales/${entry.saleId}`}
                            className="block text-[11px] text-accent hover:underline"
                          >
                            Comanda #{entry.saleNumber}
                          </Link>
                        )}
                      </td>
                      <td
                        className={`p-3 text-right tabular-nums font-semibold ${
                          negative ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {entryAmount(entry.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          Os totais somam o período inteiro. Comanda reaberta ou excluída sai do histórico: os lançamentos dela são
          apagados, não estornados.
          {data.truncated ? ` A lista mostra os ${data.entries.length} lançamentos mais recentes do período.` : ""}
        </p>
      </section>
    </div>
  )
}
