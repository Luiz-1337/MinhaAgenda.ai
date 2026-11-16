import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { getFinanceSettings } from "@/app/actions/finance-settings"
import { FinanceSettingsClient } from "./finance-settings-client"

export default async function FinanceSettingsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // A action confere sessão, módulo ligado e permissão. Sem acesso, a página mostra
  // o bloqueio no conteúdo — o menu continua onde está.
  const settings = await getFinanceSettings(salonId)

  if ("error" in settings) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Sem permissão</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{settings.error}</p>
        <Link
          href={`/${salonId}/finance`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft size={16} />
          Voltar para o financeiro
        </Link>
      </div>
    )
  }

  return <FinanceSettingsClient key={salonId} salonId={salonId} settings={settings} />
}
