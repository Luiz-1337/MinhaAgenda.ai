import { ShieldOff } from "lucide-react"
import { getSalesReport } from "@/app/actions/sales-reports"
import { SalesReportsClient } from "./sales-reports-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Relatórios de vendas e rankings (docs/ROADMAP.md, fase 9, fatia 9d). */
export default async function SalesReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getSalesReport(salonId, {
    view: first(query.view) || undefined,
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Relatório indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  const key = data.view === "catalog" ? "catalog" : `${data.view}:${data.from}:${data.to}`
  return <SalesReportsClient key={key} salonId={salonId} data={data} />
}
