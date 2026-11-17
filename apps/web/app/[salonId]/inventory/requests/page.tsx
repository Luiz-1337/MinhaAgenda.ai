import { ShieldOff } from "lucide-react"
import { getStockRequests } from "@/app/actions/inventory"
import { RequestsClient } from "./requests-client"

/** Solicitações de saída de estoque (docs/ROADMAP.md, fase 4, fatia 4e). */
export default async function StockRequestsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão. Quem só solicita vê as próprias.
  const data = await getStockRequests(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Solicitações indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <RequestsClient salonId={salonId} data={data} />
}
