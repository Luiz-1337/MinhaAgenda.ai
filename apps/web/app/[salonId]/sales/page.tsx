import { ShieldOff } from "lucide-react"
import { getSaleFormOptions, listSales } from "@/app/actions/sales"
import type { SaleListFilters } from "@/lib/types/sale"
import { SalesClient } from "./sales-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // Os filtros vivem na URL: dá para voltar, recarregar e mandar o link.
  const status = first(query.status)
  const page = Number(first(query.page))
  const filters: SaleListFilters = {
    status: status === "open" || status === "invoiced" || status === "void" ? status : undefined,
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }

  const [list, options] = await Promise.all([listSales(salonId, filters), getSaleFormOptions(salonId)])

  if ("error" in list) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Comandas indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{list.error}</p>
      </div>
    )
  }

  return (
    <SalesClient
      salonId={salonId}
      list={list}
      filters={filters}
      canCreate={"error" in options ? false : options.can.create}
    />
  )
}
