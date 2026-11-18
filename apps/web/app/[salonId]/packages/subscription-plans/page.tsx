import { ShieldOff } from "lucide-react"
import { getSubscriptionPlans } from "@/app/actions/subscriptions"
import { SubscriptionPlansClient } from "./subscription-plans-client"

/** Planos de assinatura (docs/ROADMAP.md, fase 5, fatia 5c). */
export default async function SubscriptionPlansPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getSubscriptionPlans(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Assinaturas indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <SubscriptionPlansClient salonId={salonId} data={data} />
}
