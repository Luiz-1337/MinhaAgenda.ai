import { ShieldOff } from "lucide-react"
import { getCashbackHistory } from "@/app/actions/cashback"
import { CashbackHistoryClient } from "./history-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Relatório "Histórico de cashback" (docs/ROADMAP.md, fase 6, fatia 6f). */
export default async function CashbackHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getCashbackHistory(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Histórico de cashback indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <CashbackHistoryClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
