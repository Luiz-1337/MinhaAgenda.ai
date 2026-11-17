import { ShieldOff } from "lucide-react"
import { getPurchases } from "@/app/actions/purchases"
import { PurchasesClient } from "./purchases-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Compras (docs/ROADMAP.md, fase 4, fatia 4b): o que o salão comprou, de quem, por
 * quanto, e como cada compra está no financeiro.
 */
export default async function PurchasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getPurchases(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Compras indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <PurchasesClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
