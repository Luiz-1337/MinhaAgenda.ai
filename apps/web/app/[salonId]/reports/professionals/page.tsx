import { ShieldOff } from "lucide-react"
import { getProfessionalPanel } from "@/app/actions/professional-panel"
import { ProfessionalPanelClient } from "./professional-panel-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Painel de profissionais (docs/ROADMAP.md, fase 9, fatia 9e). */
export default async function ProfessionalPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulos e permissões.
  const data = await getProfessionalPanel(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Painel indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <ProfessionalPanelClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
