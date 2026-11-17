import { ShieldOff } from "lucide-react"
import { getBatches } from "@/app/actions/inventory"
import { BatchesClient } from "./batches-client"

/** Lotes e validades (docs/ROADMAP.md, fase 4, fatia 4c). */
export default async function BatchesPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getBatches(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Lotes indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <BatchesClient salonId={salonId} data={data} />
}
