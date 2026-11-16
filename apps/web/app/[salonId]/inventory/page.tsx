import { ShieldOff } from "lucide-react"
import { getInventory } from "@/app/actions/inventory"
import { InventoryClient } from "./inventory-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Estoque (docs/ROADMAP.md, fase 4, fatia 4a): saldo e situação de cada produto,
 * sugestão de compra e a movimentação recente.
 */
export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getInventory(salonId, { productId: first(query.product) || undefined })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Estoque indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <InventoryClient salonId={salonId} data={data} />
}
