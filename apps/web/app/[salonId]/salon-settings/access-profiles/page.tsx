import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { getAccessProfilesOverview } from "@/app/actions/access-profiles"
import { AccessProfilesClient } from "./access-profiles-client"

export default async function AccessProfilesPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // A action confere sessão, módulo ligado e permissão. Sem acesso, a página
  // mostra o bloqueio no conteúdo — o menu continua onde está.
  const overview = await getAccessProfilesOverview(salonId)

  if ("error" in overview) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Sem permissão</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{overview.error}</p>
        <Link
          href={`/${salonId}/salon-settings`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={16} />
          Voltar para as configurações
        </Link>
      </div>
    )
  }

  return <AccessProfilesClient key={salonId} salonId={salonId} overview={overview} />
}
