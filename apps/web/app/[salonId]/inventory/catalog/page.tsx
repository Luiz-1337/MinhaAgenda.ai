import { ShieldOff } from "lucide-react"
import { getProductCatalog } from "@/app/actions/purchases"
import { CatalogClient } from "./catalog-client"

/** Marcas e categorias de produto (docs/ROADMAP.md, fase 4, fatia 4b). */
export default async function ProductCatalogPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getProductCatalog(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Marcas e categorias indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <CatalogClient salonId={salonId} data={data} />
}
