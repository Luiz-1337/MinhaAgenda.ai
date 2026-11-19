import { ShieldOff } from "lucide-react"
import { getCustomerReport } from "@/app/actions/agenda-reports"
import { CustomerReportsClient } from "./customer-reports-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Relatórios de clientes (docs/ROADMAP.md, fase 9, fatia 9c). */
export default async function CustomerReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getCustomerReport(salonId, {
    view: first(query.view) || undefined,
    month: first(query.month) || undefined,
    days: first(query.days) || undefined,
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

  const key = data.view === "birthdays" ? `b:${data.month}` : `i:${data.days}`
  return <CustomerReportsClient key={key} salonId={salonId} data={data} />
}
