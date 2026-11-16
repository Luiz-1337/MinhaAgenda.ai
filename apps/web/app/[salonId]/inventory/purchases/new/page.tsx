import { ShieldOff } from "lucide-react"
import { getPurchaseForm } from "@/app/actions/purchases"
import { PurchaseForm } from "./purchase-form"

/** Nova compra (docs/ROADMAP.md, fase 4, fatia 4b). */
export default async function NewPurchasePage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão de lançar compra.
  const data = await getPurchaseForm(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Nova compra indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <PurchaseForm salonId={salonId} data={data} />
}
