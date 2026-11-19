"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { SalesReportData } from "@/app/actions/sales-reports"
import {
  SALES_REPORT_VIEWS,
  SALES_REPORT_VIEW_LABELS,
  SOLD_ITEM_KINDS,
  SOLD_ITEM_KIND_LABELS,
  type SalesReportView,
} from "@repo/db/src/domain/sales-reports"
import type { CatalogService } from "@repo/db"
import { controlClass, formatCalendarDate, formatQuantity, labelClass } from "../../inventory/inventory-ui"

const money = (cents: number) => formatBRL(cents / 100)
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR")}%`)

const thClass = "px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground text-left"
const tdClass = "px-3 py-2 text-sm text-foreground text-left"
const numClass = "px-3 py-2 text-sm text-foreground text-right tabular-nums"
const numHeadClass = `${thClass} !text-right`

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="bg-card border border-border rounded-md overflow-x-auto">{children}</div>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function servicePrice(service: CatalogService): string {
  if (service.priceOnRequest) return "Sob avaliação"
  if (service.priceType === "range" && service.priceMin && service.priceMax) {
    return `${formatBRL(service.priceMin)} a ${formatBRL(service.priceMax)}`
  }
  return formatBRL(service.price)
}

function serviceDuration(service: CatalogService): string {
  return service.durationMax && service.durationMax !== service.duration
    ? `${service.duration} a ${service.durationMax} min`
    : `${service.duration} min`
}

const inactiveBadge = (
  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">Inativo</span>
)

/**
 * Relatórios de vendas e rankings (docs/ROADMAP.md, fase 9, fatia 9d). O
 * relatório e o período vivem na URL.
 */
export function SalesReportsClient({ salonId, data }: { salonId: string; data: SalesReportData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const hasPeriod = data.view !== "catalog"

  function navigate(next: { view?: SalesReportView; from?: string; to?: string }) {
    const view = next.view ?? data.view
    const params = new URLSearchParams({ view })
    if (view !== "catalog" && data.view !== "catalog") {
      params.set("from", next.from ?? data.from)
      params.set("to", next.to ?? data.to)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{SALES_REPORT_VIEW_LABELS[data.view]}</h2>
          <Link
            href={`/${salonId}/reports`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> Todos os relatórios
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="sales-report-view" className={labelClass}>
            Relatório
          </label>
          <select
            id="sales-report-view"
            value={data.view}
            disabled={isPending}
            onChange={(event) => navigate({ view: event.target.value as SalesReportView })}
            className={controlClass}
          >
            {SALES_REPORT_VIEWS.map((view) => (
              <option key={view} value={view}>
                {SALES_REPORT_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </div>
        {hasPeriod && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="sales-report-from" className={labelClass}>
                De
              </label>
              <input
                id="sales-report-from"
                type="date"
                defaultValue={data.from}
                disabled={isPending}
                onChange={(event) => {
                  if (event.target.value) navigate({ from: event.target.value })
                }}
                className={controlClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sales-report-to" className={labelClass}>
                Até
              </label>
              <input
                id="sales-report-to"
                type="date"
                defaultValue={data.to}
                disabled={isPending}
                onChange={(event) => {
                  if (event.target.value) navigate({ to: event.target.value })
                }}
                className={controlClass}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:pb-2.5">
              {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
            </p>
          </>
        )}
      </div>

      {"truncated" in data && data.truncated && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          O período tem mais itens de comanda do que o relatório lê. Os números abaixo são só do que foi lido: escolha
          um período menor.
        </p>
      )}

      {data.view === "items" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="Total vendido" value={money(data.report.totalCents)} />
            {SOLD_ITEM_KINDS.map((kind) => (
              <Stat key={kind} label={`${SOLD_ITEM_KIND_LABELS[kind]}s`} value={money(data.report.byKind[kind])} />
            ))}
          </div>
          <Panel>
            {data.report.rows.length === 0 ? (
              <Empty>Nada vendido em comanda faturada no período.</Empty>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={thClass}>Item</th>
                    <th className={thClass}>Tipo</th>
                    <th className={numHeadClass}>Qtd.</th>
                    <th className={numHeadClass}>Comandas</th>
                    <th className={numHeadClass}>Valor</th>
                    <th className={numHeadClass}>Parte do total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.report.rows.map((row) => (
                    <tr key={row.key}>
                      <td className={tdClass}>{row.name}</td>
                      <td className={tdClass}>{SOLD_ITEM_KIND_LABELS[row.kind]}</td>
                      <td className={numClass}>{formatQuantity(row.quantity)}</td>
                      <td className={numClass}>{row.sales}</td>
                      <td className={`${numClass} font-semibold`}>{money(row.revenueCents)}</td>
                      <td className={numClass}>{percent(row.sharePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Note>
            Comandas faturadas, pelo dia da comanda. O valor é o total do item, já com desconto e cupom. Item usado de
            um pacote entra com valor zero: quem pagou foi a venda do pacote.
          </Note>
        </>
      )}

      {data.view === "customers" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Clientes que compraram" value={String(data.report.customers)} />
            <Stat label="Total" value={money(data.report.totalCents)} />
            <Stat
              label="Por cliente"
              value={data.report.customers > 0 ? money(Math.round(data.report.totalCents / data.report.customers)) : "—"}
              hint="Total ÷ clientes"
            />
          </div>
          <Panel>
            {data.report.rows.length === 0 ? (
              <Empty>Nenhum cliente com comanda faturada no período.</Empty>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={numHeadClass}>#</th>
                    <th className={thClass}>Cliente</th>
                    <th className={numHeadClass}>Comandas</th>
                    <th className={numHeadClass}>Total</th>
                    <th className={numHeadClass}>Ticket médio</th>
                    <th className={thClass}>Última comanda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.report.rows.map((row, index) => (
                    <tr key={row.customerId}>
                      <td className={numClass}>{index + 1}</td>
                      <td className={tdClass}>
                        <Link href={`/${salonId}/contacts/${row.customerId}`} className="hover:underline">
                          {row.name}
                        </Link>
                      </td>
                      <td className={numClass}>{row.sales}</td>
                      <td className={`${numClass} font-semibold`}>{money(row.totalCents)}</td>
                      <td className={numClass}>{money(row.averageCents)}</td>
                      <td className={`${tdClass} tabular-nums`}>{formatCalendarDate(row.lastDay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Note>
            Comandas faturadas, pelo dia da comanda: quem mais gastou primeiro. A lista mostra os 100 primeiros; os
            cartões somam todos. Conta o que foi faturado, pago ou não (fiado entra).
          </Note>
        </>
      )}

      {data.view === "professionals" && (
        <>
          <Panel>
            {data.rows.length === 0 ? (
              <Empty>Nenhum serviço ou produto em comanda faturada no período.</Empty>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={thClass}>Profissional</th>
                    <th className={numHeadClass}>Serviços</th>
                    <th className={numHeadClass}>Valor em serviços</th>
                    <th className={numHeadClass}>Produtos</th>
                    <th className={numHeadClass}>Valor em produtos</th>
                    <th className={numHeadClass}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((row) => (
                    <tr key={row.professionalId ?? "none"}>
                      <td className={tdClass}>{row.name}</td>
                      <td className={numClass}>{formatQuantity(row.serviceQuantity)}</td>
                      <td className={numClass}>{money(row.serviceCents)}</td>
                      <td className={numClass}>{formatQuantity(row.productQuantity)}</td>
                      <td className={numClass}>{money(row.productCents)}</td>
                      <td className={`${numClass} font-semibold`}>{money(row.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Note>
            Comandas faturadas, pelo dia da comanda. Serviço conta para quem executou; produto, para quem vendeu. O
            auxiliar não entra. Produto vendido sem vendedor marcado fica em &quot;Sem profissional&quot;. Pacote e
            assinatura não entram.
          </Note>
        </>
      )}

      {data.view === "referrals" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Clientes cadastrados" value={String(data.report.total)} hint="No período" />
            <Stat
              label="Informaram"
              value={String(data.report.informed)}
              hint={
                data.report.total > 0
                  ? `${(Math.round((data.report.informed / data.report.total) * 1000) / 10).toLocaleString("pt-BR")}% dos cadastrados`
                  : undefined
              }
            />
          </div>
          <Panel>
            {data.report.rows.length === 0 ? (
              <Empty>
                Nenhum cliente cadastrado no período tem &quot;como conheceu&quot; preenchido. O campo fica na ficha do
                cliente.
              </Empty>
            ) : (
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={thClass}>Como conheceu</th>
                    <th className={numHeadClass}>Clientes</th>
                    <th className={numHeadClass}>Parte de quem informou</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.report.rows.map((row) => (
                    <tr key={row.source}>
                      <td className={tdClass}>{row.source}</td>
                      <td className={numClass}>{row.customers}</td>
                      <td className={numClass}>{percent(row.sharePercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          <Note>
            Clientes cadastrados no período, pelo campo &quot;como conheceu&quot; da ficha. O campo é texto livre: o
            relatório junta o que só difere por maiúscula, acento ou espaço.
          </Note>
        </>
      )}

      {data.view === "catalog" && (
        <>
          {data.services && (
            <Panel>
              <p className="px-3 pt-3 text-sm font-bold text-foreground">Serviços ({data.services.length})</p>
              {data.services.length === 0 ? (
                <Empty>Nenhum serviço cadastrado.</Empty>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thClass}>Serviço</th>
                      <th className={numHeadClass}>Duração</th>
                      <th className={numHeadClass}>Preço</th>
                      <th className={numHeadClass}>Custo fixo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.services.map((service) => (
                      <tr key={service.id}>
                        <td className={tdClass}>
                          {service.name}
                          {!service.isActive && inactiveBadge}
                        </td>
                        <td className={numClass}>{serviceDuration(service)}</td>
                        <td className={numClass}>{servicePrice(service)}</td>
                        <td className={numClass}>{formatBRL(service.additionalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
          {data.products && (
            <Panel>
              <p className="px-3 pt-3 text-sm font-bold text-foreground">Produtos ({data.products.length})</p>
              {data.products.length === 0 ? (
                <Empty>Nenhum produto cadastrado.</Empty>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thClass}>Produto</th>
                      <th className={thClass}>Código</th>
                      <th className={numHeadClass}>Preço</th>
                      <th className={numHeadClass}>Custo de compra</th>
                      <th className={numHeadClass}>Preço para profissional</th>
                      <th className={thClass}>Estoque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.products.map((product) => (
                      <tr key={product.id}>
                        <td className={tdClass}>
                          {product.name}
                          {!product.isActive && inactiveBadge}
                        </td>
                        <td className={tdClass}>{product.sku ?? "—"}</td>
                        <td className={numClass}>{formatBRL(product.price)}</td>
                        <td className={numClass}>{formatBRL(product.costPrice)}</td>
                        <td className={numClass}>{formatBRL(product.professionalPrice)}</td>
                        <td className={tdClass}>{product.trackStock ? "Controlado" : "Sem controle"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
          <Note>
            O catálogo como está hoje, ativos e inativos. Não mostra o saldo de estoque (está em Estoque) nem a comissão
            de cada item (está em Comissões).
          </Note>
        </>
      )}
    </div>
  )
}
