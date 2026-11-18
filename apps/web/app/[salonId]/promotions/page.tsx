import { ShieldOff } from "lucide-react"
import { getPromotions } from "@/app/actions/promotions"
import { PromotionsClient } from "./promotions-client"

/** Promoções e cupons (docs/ROADMAP.md, fase 6, fatia 6b). */
export default async function PromotionsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getPromotions(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Promoções indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <PromotionsClient salonId={salonId} data={data} />
}
