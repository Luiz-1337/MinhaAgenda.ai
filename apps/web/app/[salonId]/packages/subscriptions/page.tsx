import { ShieldOff } from "lucide-react"
import { getCustomerSubscriptions } from "@/app/actions/subscriptions"
import { SubscriptionsClient } from "./subscriptions-client"

/** Assinaturas de cliente (docs/ROADMAP.md, fase 5, fatia 5c). */
export default async function SubscriptionsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getCustomerSubscriptions(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Assinaturas indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <SubscriptionsClient salonId={salonId} data={data} />
}
