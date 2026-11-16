"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"
import { ChevronLeft, ChevronRight, Plus, Receipt } from "lucide-react"
import { SALE_STATUS_BADGE, SALE_STATUS_LABELS } from "@/lib/constants/sales.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import type { SaleListFilters, SaleListPage } from "@/lib/types/sale"

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const controlClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all"

export function SalesClient({
  salonId,
  list,
  filters,
  canCreate,
}: {
  salonId: string
  list: SaleListPage
  filters: SaleListFilters
  canCreate: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const totalPages = Math.max(1, Math.ceil(list.total / list.pageSize))

  function navigate(next: SaleListFilters) {
    const params = new URLSearchParams()
    if (next.status) params.set("status", next.status)
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    if (next.debt) params.set("debt", "1")
    if (next.page && next.page > 1) params.set("page", String(next.page))

    const query = params.toString()
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname))
  }

  // Mudar um filtro volta para a primeira página.
  function setFilter(patch: Partial<SaleListFilters>) {
    navigate({ ...filters, ...patch, page: 1 })
  }

  return (
    <div className="flex flex-col h-full gap-6">
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Receipt size={24} className="text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Comandas</h2>
        </div>
        {canCreate && (
          <Link
            href={`/${salonId}/sales/new`}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors shadow-md"
          >
            <Plus size={16} />
            Nova comanda
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="sales-status" className="text-xs font-semibold text-muted-foreground">
            Situação
          </label>
          <select
            id="sales-status"
            value={filters.debt ? "debt" : (filters.status ?? "")}
            onChange={(event) => {
              const value = event.target.value
              // "Com valor em aberto" não é um status: é comanda finalizada que ainda
              // tem débito do cliente.
              if (value === "debt") setFilter({ status: undefined, debt: true })
              else setFilter({ status: (value || undefined) as SaleListFilters["status"], debt: undefined })
            }}
            className={controlClass}
          >
            <option value="">Pendentes e finalizadas</option>
            <option value="open">Pendentes</option>
            <option value="invoiced">Finalizadas</option>
            <option value="debt">Com valor em aberto</option>
            <option value="void">Excluídas</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sales-from" className="text-xs font-semibold text-muted-foreground">
            De
          </label>
          <input
            id="sales-from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => setFilter({ from: event.target.value || undefined })}
            className={controlClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="sales-to" className="text-xs font-semibold text-muted-foreground">
            Até
          </label>
          <input
            id="sales-to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => setFilter({ to: event.target.value || undefined })}
            className={controlClass}
          />
        </div>
        {(filters.status || filters.debt || filters.from || filters.to) && (
          <button
            onClick={() => navigate({})}
            className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div
        className={`flex-1 overflow-hidden bg-card rounded-md border border-border flex flex-col transition-opacity ${
          isPending ? "opacity-60" : ""
        }`}
        aria-busy={isPending}
      >
        <div className="hidden md:grid grid-cols-12 gap-4 p-4 border-b border-border bg-muted/50 text-xs font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-1 pl-2">Nº</div>
          <div className="col-span-2">Data</div>
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Situação</div>
          <div className="col-span-2">Pagamento</div>
          <div className="col-span-2 text-right pr-2">Total</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {list.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Receipt size={32} className="mb-3 opacity-50" />
              <p>Nenhuma comanda encontrada.</p>
            </div>
          ) : (
            list.rows.map((sale, index) => (
              <Link
                key={sale.id}
                href={`/${salonId}/sales/${sale.id}`}
                className={`flex flex-col md:grid md:grid-cols-12 gap-1 md:gap-4 p-4 md:items-center border-b border-border text-sm transition-colors hover:bg-muted ${
                  index % 2 === 0 ? "bg-transparent" : "bg-muted/30"
                }`}
              >
                <div className="md:col-span-1 md:pl-2 font-mono font-semibold text-foreground">#{sale.number}</div>
                <div className="md:col-span-2 text-muted-foreground tabular-nums">
                  {dateFormat.format(new Date(sale.saleDate))}
                </div>
                <div className="md:col-span-3 font-semibold text-foreground truncate">{sale.customerName}</div>
                <div className="md:col-span-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${SALE_STATUS_BADGE[sale.status]}`}
                  >
                    {SALE_STATUS_LABELS[sale.status]}
                  </span>
                  {Number(sale.amountDue) > 0 && (
                    <span className="block mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Em aberto {formatBRL(sale.amountDue)}
                    </span>
                  )}
                </div>
                <div className="md:col-span-2 text-muted-foreground text-xs truncate">
                  {sale.paymentMethods.length > 0 ? sale.paymentMethods.join(", ") : "—"}
                </div>
                <div className="md:col-span-2 md:text-right md:pr-2 font-mono font-medium text-foreground tabular-nums">
                  {formatBRL(sale.total)}
                </div>
              </Link>
            ))
          )}
        </div>

        {list.total > list.pageSize && (
          <div className="flex items-center justify-between gap-3 p-3 border-t border-border text-xs text-muted-foreground">
            <span>
              {list.total} comandas · página {list.page} de {totalPages}
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
    </div>
  )
}
