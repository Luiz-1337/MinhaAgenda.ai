import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { brazilToday } from "@repo/db"
import { getCommissionConfig } from "@/app/actions/commissions"
import { CommissionSettingsClient } from "./commission-settings-client"

export default async function CommissionSettingsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // A action confere sessão, módulo ligado e permissão. Sem acesso, a página mostra
  // o bloqueio no conteúdo — o menu continua onde está.
  const config = await getCommissionConfig(salonId)

  if ("error" in config) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Sem permissão</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{config.error}</p>
        <Link
          href={`/${salonId}/commissions`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={16} />
          Voltar para as comissões
        </Link>
      </div>
    )
  }

  return (
    <CommissionSettingsClient key={salonId} salonId={salonId} config={config} today={brazilToday(new Date())} />
  )
}
