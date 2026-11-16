import { ShieldOff } from "lucide-react"
import { brazilToday } from "@repo/db"
import { getFinanceFormOptions, listFinanceTransactions } from "@/app/actions/finance"
import type { FinanceListFilters } from "@/lib/types/finance"
import { FinanceClient } from "./finance-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function FinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // Os filtros vivem na URL: dá para voltar, recarregar e mandar o link.
  const direction = first(query.direction)
  const status = first(query.status)
  const page = Number(first(query.page))
  const filters: FinanceListFilters = {
    direction: direction === "in" || direction === "out" ? direction : undefined,
    status: status === "open" || status === "paid" ? status : undefined,
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
    accountId: first(query.account) || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }

  const [list, options] = await Promise.all([
    listFinanceTransactions(salonId, filters),
    getFinanceFormOptions(salonId),
  ])

  const error = "error" in list ? list.error : "error" in options ? options.error : null
  if (error || "error" in list || "error" in options) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Financeiro indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
      </div>
    )
  }

  return (
    <FinanceClient
      salonId={salonId}
      list={list}
      filters={filters}
      options={options}
      // "Hoje" em Brasília vem do servidor: decide o que está atrasado e a data
      // padrão dos formulários, sem depender do relógio de quem abre a tela.
      today={brazilToday(new Date())}
    />
  )
}
