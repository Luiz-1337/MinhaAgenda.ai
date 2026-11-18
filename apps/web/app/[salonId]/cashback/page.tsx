import { ShieldOff } from "lucide-react"
import { getCashbackOverview } from "@/app/actions/cashback"
import { CashbackClient } from "./cashback-client"

/** Cashback (docs/ROADMAP.md, fase 6, fatia 6a). */
export default async function CashbackPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getCashbackOverview(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Cashback indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <CashbackClient salonId={salonId} data={data} />
}
