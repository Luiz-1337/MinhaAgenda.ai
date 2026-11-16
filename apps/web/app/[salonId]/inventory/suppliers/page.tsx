import { ShieldOff } from "lucide-react"
import { getSuppliers } from "@/app/actions/purchases"
import { SuppliersClient } from "./suppliers-client"

/** Fornecedores (docs/ROADMAP.md, fase 4, fatia 4b). */
export default async function SuppliersPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getSuppliers(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Fornecedores indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <SuppliersClient salonId={salonId} data={data} />
}
