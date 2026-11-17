import { ShieldOff } from "lucide-react"
import { getServiceConsumption } from "@/app/actions/inventory"
import { ConsumptionClient } from "./consumption-client"

/** Produtos consumidos por serviço (docs/ROADMAP.md, fase 4, fatia 4d). */
export default async function ServiceConsumptionPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getServiceConsumption(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Consumo por serviço indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <ConsumptionClient salonId={salonId} data={data} />
}
