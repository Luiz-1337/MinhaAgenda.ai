import { ShieldOff } from "lucide-react"
import { getGoals } from "@/app/actions/goals"
import { GoalsClient } from "./goals-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Metas por mês (docs/ROADMAP.md, fase 6, fatia 6e). */
export default async function GoalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getGoals(salonId, first(query.month) || undefined)

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Metas indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <GoalsClient key={data.month} salonId={salonId} data={data} />
}
