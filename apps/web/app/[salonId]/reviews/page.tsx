import { ShieldOff } from "lucide-react"
import { getReviews } from "@/app/actions/reviews"
import { ReviewsClient } from "./reviews-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Avaliações pós-atendimento (docs/ROADMAP.md, fase 6, fatia 6c). */
export default async function ReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão.
  const data = await getReviews(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Avaliações indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return <ReviewsClient key={`${data.from}:${data.to}`} salonId={salonId} data={data} />
}
