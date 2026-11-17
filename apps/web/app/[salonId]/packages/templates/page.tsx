import { ShieldOff } from "lucide-react"
import { getPackageTemplates } from "@/app/actions/packages"
import { TemplatesClient } from "./templates-client"

/** Pacotes predefinidos (docs/ROADMAP.md, fase 5, fatia 5a). */
export default async function PackageTemplatesPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getPackageTemplates(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Pacotes indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <TemplatesClient salonId={salonId} data={data} />
}
