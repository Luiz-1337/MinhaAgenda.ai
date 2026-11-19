import { ShieldOff } from "lucide-react"
import { getFinanceReport } from "@/app/actions/finance-reports"
import { FinanceReportsClient } from "./finance-reports-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Relatórios financeiros (docs/ROADMAP.md, fase 9, fatia 9b). */
export default async function FinanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulos e permissão.
  const data = await getFinanceReport(salonId, {
    view: first(query.view) || undefined,
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
    account: first(query.account) || undefined,
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

  const key = `${data.view}:${data.from}:${data.to}:${data.view === "statement" ? data.accountId : ""}`
  return <FinanceReportsClient key={key} salonId={salonId} data={data} />
}
