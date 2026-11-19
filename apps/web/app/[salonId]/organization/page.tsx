import { ShieldOff } from "lucide-react"
import { getOrganization } from "@/app/actions/organization"
import { OrganizationClient } from "./organization-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Organização: as unidades do dono lado a lado (docs/ROADMAP.md, fase 9, fatia 9g). */
export default async function OrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo, permissão e que quem abre é o dono.
  const data = await getOrganization(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Organização indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <OrganizationClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
