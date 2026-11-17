"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { BarChart3 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { StockReportsDTO } from "@/lib/types/inventory"
import { InventoryNav, controlClass, formatCalendarDate, formatQuantity, labelClass } from "../inventory-ui"

/** Milésimos → "1,5". Zero vira "—": numa tabela cheia, o que não houve some. */
function quantity(milli: number): string {
  return milli === 0 ? "—" : formatQuantity(milli / 1000)
}

/** Acerto tem sinal: "+ 2", "− 1,5". */
function signedQuantity(milli: number): string {
  if (milli === 0) return "—"
  return `${milli > 0 ? "+" : "−"} ${formatQuantity(Math.abs(milli) / 1000)}`
}

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
 * Relatórios de estoque (docs/ROADMAP.md, fase 4, fatia 4f): movimentação por
 * produto e produtos consumidos pelos atendimentos, no período.
 *
 * O período vive na URL (`?from=&to=`): dá para voltar, recarregar e mandar o link.
 */
export function ReportsClient({ salonId, data }: { salonId: string; data: StockReportsDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { from: string; to: string }) {
    const params = new URLSearchParams(next)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const { movements, consumption } = data

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Relatórios de estoque</h2>
          <p className="text-xs text-muted-foreground">
            O que entrou, o que saiu e o que os atendimentos consumiram no período.
          </p>
        </div>
      </div>

      <InventoryNav salonId={salonId} />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="stock-reports-from" className={labelClass}>
            De
          </label>
          <input
            id="stock-reports-from"
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
          <label htmlFor="stock-reports-to" className={labelClass}>
            Até
          </label>
          <input
            id="stock-reports-to"
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Produtos com movimento ou saldo"
          value={String(movements.totals.products)}
          hint="No período"
        />
        <Stat
          label="Entradas"
          value={formatBRL(movements.totals.inValueCents / 100)}
          hint="Entradas e compras × custo de compra atual"
        />
        <Stat
          label="Saídas"
          value={formatBRL(movements.totals.outValueCents / 100)}
          hint="Vendas, consumo, retiradas e saídas × custo de compra atual"
        />
      </div>

      <section className="bg-card border border-border rounded-md" aria-labelledby="stock-reports-movements">
        <div className="p-3 border-b border-border bg-muted/50">
          <h3
            id="stock-reports-movements"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Movimentação por produto
          </h3>
        </div>
        {movements.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum produto com movimento ou saldo no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-right font-semibold">Saldo inicial</th>
                  <th scope="col" className="p-3 text-right font-semibold">Entradas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Vendas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Consumo</th>
                  <th scope="col" className="p-3 text-right font-semibold">Retiradas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Saídas</th>
                  <th scope="col" className="p-3 text-right font-semibold">Acertos</th>
                  <th scope="col" className="p-3 text-right font-semibold">Saldo final</th>
                  <th scope="col" className="p-3 text-right font-semibold">Custo das saídas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.rows.map((row) => (
                  <tr key={row.productId}>
                    <th scope="row" className="p-3 text-left font-semibold text-foreground">
                      {row.name}
                    </th>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {formatQuantity(row.openingMilli / 1000)}
                    </td>
                    <td className="p-3 text-right tabular-nums">{quantity(row.inMilli)}</td>
                    <td className="p-3 text-right tabular-nums">{quantity(row.soldMilli)}</td>
                    <td className="p-3 text-right tabular-nums">{quantity(row.consumedMilli)}</td>
                    <td className="p-3 text-right tabular-nums">{quantity(row.requestedMilli)}</td>
                    <td className="p-3 text-right tabular-nums">{quantity(row.outMilli)}</td>
                    <td className="p-3 text-right tabular-nums">{signedQuantity(row.adjustmentMilli)}</td>
                    <td
                      className={`p-3 text-right tabular-nums font-semibold ${
                        row.closingMilli < 0 ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {formatQuantity(row.closingMilli / 1000)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {row.outValueCents === 0 ? "—" : formatBRL(row.outValueCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          Quantidades em unidades de estoque. Saldo final = saldo inicial + entradas − vendas − consumo − retiradas −
          saídas ± acertos. Os valores usam o custo de compra de hoje, não o da data do movimento.
        </p>
      </section>

      <section className="bg-card border border-border rounded-md" aria-labelledby="stock-reports-consumption">
        <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between gap-3">
          <h3
            id="stock-reports-consumption"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Produtos consumidos
          </h3>
          {consumption.rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Custo estimado:{" "}
              <span className="font-semibold text-foreground">{formatBRL(consumption.totalCostCents / 100)}</span>
            </p>
          )}
        </div>
        {consumption.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum produto consumido por atendimento no período. O consumo de cada serviço é definido em Consumo por
            serviço e baixa quando a comanda é faturada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-left font-semibold">Serviços</th>
                  <th scope="col" className="p-3 text-right font-semibold">Consumido</th>
                  <th scope="col" className="p-3 text-right font-semibold">Em unidades</th>
                  <th scope="col" className="p-3 text-right font-semibold">Custo estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {consumption.rows.map((row) => (
                  <tr key={row.productId} className="align-top">
                    <th scope="row" className="p-3 text-left font-semibold text-foreground">
                      {row.name}
                    </th>
                    <td className="p-3 text-muted-foreground">
                      <ul className="flex flex-col gap-0.5">
                        {row.services.map((service) => (
                          <li key={service.serviceId ?? "removed"}>
                            {service.serviceName ?? "Serviço removido"} · {service.items}{" "}
                            {service.items === 1 ? "item de comanda" : "itens de comanda"} ·{" "}
                            {formatQuantity(service.unitsMilli / 1000)} un
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {row.measureMilli === null
                        ? "—"
                        : `${formatQuantity(row.measureMilli / 1000)} ${row.contentUnit ?? ""}`.trim()}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatQuantity(row.unitsMilli / 1000)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                      {row.costCents === 0 ? "—" : formatBRL(row.costCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
