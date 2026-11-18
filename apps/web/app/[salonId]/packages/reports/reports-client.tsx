"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { BarChart3 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { PackageReportsDTO } from "@/lib/types/packages"
import { controlClass, formatCalendarDate, formatQuantity, labelClass } from "../../inventory/inventory-ui"
import { PackagesNav } from "../packages-ui"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

/**
 * Relatórios de pacotes e assinaturas (docs/ROADMAP.md, fase 5, fatia 5d): o
 * extrato de pacotes (o que foi vendido e o que foi usado) e as vendas por
 * assinatura, no período.
 *
 * O período vive na URL (`?from=&to=`): dá para voltar, recarregar e mandar o link.
 */
export function PackageReportsClient({ salonId, data }: { salonId: string; data: PackageReportsDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { from: string; to: string }) {
    const params = new URLSearchParams(next)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const { statement, subscriptions } = data

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Relatórios de pacotes</h2>
          <p className="text-xs text-muted-foreground">
            O que foi vendido e usado de pacotes, e o que as assinaturas renderam no período.
          </p>
        </div>
      </div>

      <PackagesNav salonId={salonId} />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="package-reports-from" className={labelClass}>
            De
          </label>
          <input
            id="package-reports-from"
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
          <label htmlFor="package-reports-to" className={labelClass}>
            Até
          </label>
          <input
            id="package-reports-to"
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
          {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
        </p>
      </div>

      {data.truncated && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          O período tem mais linhas do que a tela mostra. Os totais abaixo são só do que aparece: escolha um período
          menor para ver tudo.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Pacotes vendidos"
          value={formatBRL(statement.totals.soldCents / 100)}
          hint={`${statement.totals.soldCount} ${statement.totals.soldCount === 1 ? "pacote" : "pacotes"}`}
        />
        <Stat
          label="Pacotes usados"
          value={formatBRL(statement.totals.usedCents / 100)}
          hint={`${formatQuantity(statement.totals.usedQuantity)} ${
            statement.totals.usedQuantity === 1 ? "sessão ou unidade" : "sessões e unidades"
          }, pelo valor de cada uma`}
        />
        <Stat
          label="Assinaturas"
          value={formatBRL(subscriptions.totals.amountCents / 100)}
          hint={`${subscriptions.totals.charges} ${subscriptions.totals.charges === 1 ? "cobrança" : "cobranças"}`}
        />
        <Stat
          label="Assinantes que pagaram"
          value={String(subscriptions.totals.customers)}
          hint="Clientes com cobrança no período"
        />
      </div>

      <section className="bg-card border border-border rounded-md" aria-labelledby="package-reports-statement">
        <div className="p-3 border-b border-border bg-muted/50">
          <h3
            id="package-reports-statement"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Extrato de pacotes
          </h3>
        </div>
        {statement.entries.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum pacote vendido ou usado no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Movimento</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Pacote</th>
                  <th scope="col" className="p-3 text-left font-semibold">Item</th>
                  <th scope="col" className="p-3 text-right font-semibold">Qtde</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statement.entries.map((entry) => (
                  <tr key={entry.key} className="align-top">
                    <td className="p-3 tabular-nums">
                      {formatCalendarDate(entry.day)}
                      <Link
                        href={`/${salonId}/sales/${entry.saleId}`}
                        className="block text-[11px] text-accent hover:underline"
                      >
                        Comanda #{entry.saleNumber}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          entry.kind === "sale"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {entry.kind === "sale" ? "Venda" : "Uso"}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-foreground">{entry.customerName}</td>
                    <td className="p-3 text-foreground">{entry.packageName}</td>
                    <td className="p-3 text-muted-foreground">
                      {entry.description ?? "—"}
                      {entry.professionalName && (
                        <span className="block text-[11px]">{entry.professionalName}</span>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {entry.quantity === null ? "—" : formatQuantity(entry.quantity)}
                    </td>
                    <td
                      className={`p-3 text-right tabular-nums ${
                        entry.kind === "sale" ? "font-semibold text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {formatBRL(entry.valueCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          A venda mostra o que o cliente pagou pelo pacote, no dia da comanda. O uso não é cobrado: o valor é o da
          sessão (a parte do preço do pacote que cabe a ela), a mesma base da comissão de quem executou.
        </p>
      </section>

      <section className="bg-card border border-border rounded-md" aria-labelledby="package-reports-subscriptions">
        <div className="p-3 border-b border-border bg-muted/50">
          <h3
            id="package-reports-subscriptions"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Vendas por assinatura
          </h3>
        </div>
        {subscriptions.charges.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma cobrança de assinatura no período.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="p-3 text-left font-semibold">Plano</th>
                    <th scope="col" className="p-3 text-right font-semibold">Cobranças</th>
                    <th scope="col" className="p-3 text-right font-semibold">Assinantes</th>
                    <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.plans.map((plan) => (
                    <tr key={plan.planId}>
                      <th scope="row" className="p-3 text-left font-semibold text-foreground">
                        {plan.planName}
                      </th>
                      <td className="p-3 text-right tabular-nums">{plan.charges}</td>
                      <td className="p-3 text-right tabular-nums">{plan.customers}</td>
                      <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                        {formatBRL(plan.amountCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto border-t border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="p-3 text-left font-semibold">Data</th>
                    <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                    <th scope="col" className="p-3 text-left font-semibold">Assinatura</th>
                    <th scope="col" className="p-3 text-left font-semibold">Período pago</th>
                    <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.charges.map((charge) => (
                    <tr key={charge.periodId} className="align-top">
                      <td className="p-3 tabular-nums">
                        {formatCalendarDate(charge.day)}
                        <Link
                          href={`/${salonId}/sales/${charge.saleId}`}
                          className="block text-[11px] text-accent hover:underline"
                        >
                          Comanda #{charge.saleNumber}
                        </Link>
                      </td>
                      <td className="p-3 font-semibold text-foreground">{charge.customerName}</td>
                      <td className="p-3 text-foreground">{charge.subscriptionName}</td>
                      <td className="p-3 tabular-nums text-muted-foreground">
                        {formatCalendarDate(charge.periodStart)} a {formatCalendarDate(charge.periodEnd)}
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                        {formatBRL(charge.amountCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          Conta a cobrança faturada, no dia da comanda. Cobrança de comanda reaberta sai do relatório.
        </p>
      </section>
    </div>
  )
}
