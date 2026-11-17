import { ShieldOff } from "lucide-react"
import { getPackageReports } from "@/app/actions/packages"
import { PackageReportsClient } from "./reports-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Relatórios de pacotes e assinaturas (docs/ROADMAP.md, fase 5, fatia 5d). */
export default async function PackageReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getPackageReports(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Relatórios de pacotes indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <PackageReportsClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
