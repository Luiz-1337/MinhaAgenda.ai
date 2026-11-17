"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Gift } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { CustomerPackagesDTO } from "@/lib/types/packages"
import type { CustomerPackageStatus } from "@repo/db"
import { formatCalendarDate } from "../inventory/inventory-ui"
import { PackagesNav } from "./packages-ui"

const STATUS_LABELS: Record<CustomerPackageStatus, string> = {
  active: "Disponível",
  expired: "Vencido",
  used: "Utilizado",
}

const STATUS_CLASSES: Record<CustomerPackageStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  expired: "bg-destructive/10 text-destructive",
  used: "bg-muted text-muted-foreground",
}

type Filter = "all" | CustomerPackageStatus

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
 * Pacotes vendidos (docs/ROADMAP.md, fase 5, fatia 5a): cliente, data, validade,
 * pacote, vendedor e o que resta ("Disponibilidade" na Belasis).
 */
export function PackagesClient({ salonId, data }: { salonId: string; data: CustomerPackagesDTO }) {
  const [filter, setFilter] = useState<Filter>("all")

  const visible = useMemo(
    () => (filter === "all" ? data.packages : data.packages.filter((pkg) => pkg.status === filter)),
    [data.packages, filter]
  )

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "active", label: `Disponíveis (${data.totals.active})` },
    { key: "expired", label: `Vencidos (${data.totals.expired})` },
    { key: "used", label: `Utilizados (${data.totals.used})` },
  ]

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Gift size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Pacotes</h2>
            <p className="text-xs text-muted-foreground">
              Pacotes vendidos e o que resta de cada um. O pacote nasce quando a comanda que o vendeu é faturada.
            </p>
          </div>
        </div>
        {data.canSell && (
          <Link
            href={`/${salonId}/sales/new`}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Vender pacote
          </Link>
        )}
      </div>

      <PackagesNav salonId={salonId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Disponíveis" value={String(data.totals.active)} hint="Com saldo e na validade" />
        <Stat label="Vencidos" value={String(data.totals.expired)} hint="Passaram da validade com saldo" />
        <Stat label="Utilizados" value={String(data.totals.used)} hint="Sem saldo" />
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pacotes vendidos</h3>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar pacotes">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                  filter === item.key
                    ? "bg-foreground border-foreground text-background"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.packages.length === 0 ? "Nenhum pacote vendido." : "Nenhum pacote nesta situação."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Pacote</th>
                  <th scope="col" className="p-3 text-left font-semibold">Disponibilidade</th>
                  <th scope="col" className="p-3 text-left font-semibold">Validade</th>
                  <th scope="col" className="p-3 text-left font-semibold">Vendedor</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((pkg) => (
                  <tr key={pkg.id} className="align-top">
                    <td className="p-3 tabular-nums">
                      {formatCalendarDate(pkg.soldOn)}
                      <Link
                        href={`/${salonId}/sales/${pkg.saleId}`}
                        className="block text-[11px] text-accent hover:underline"
                      >
                        Comanda #{pkg.saleNumber}
                      </Link>
                    </td>
                    <td className="p-3 font-semibold text-foreground">{pkg.customerName}</td>
                    <td className="p-3 text-foreground">{pkg.name}</td>
                    <td className="p-3 text-muted-foreground">
                      <ul className="flex flex-col gap-0.5">
                        {pkg.items.map((item, index) => (
                          <li key={index}>
                            {item.remaining} de {item.quantity} · {item.description}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {pkg.expiresOn ? formatCalendarDate(pkg.expiresOn) : "Não vence"}
                    </td>
                    <td className="p-3 text-muted-foreground">{pkg.sellerName ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{formatBRL(pkg.price)}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_CLASSES[pkg.status]}`}
                      >
                        {STATUS_LABELS[pkg.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.truncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando os {data.packages.length} pacotes mais recentes.
          </p>
        )}
      </section>
    </div>
  )
}
