import { ShieldOff } from "lucide-react"
import { getReportsHome } from "@/app/actions/reports"
import { ReportsClient } from "./reports-client"

/** Central de relatórios (docs/ROADMAP.md, fase 9, fatia 9a). */
export default async function ReportsPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params

  // A action confere sessão, módulo e permissão.
  const data = await getReportsHome(salonId)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Relatórios indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <ReportsClient salonId={salonId} data={data} />
}
