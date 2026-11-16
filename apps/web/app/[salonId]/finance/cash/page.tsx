import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { getCashOverview } from "@/app/actions/cash"
import { CashClient } from "./cash-client"

export default async function CashPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // A action confere sessão, módulo ligado e permissão. Sem acesso, a página mostra
  // o bloqueio no conteúdo — o menu continua onde está.
  const overview = await getCashOverview(salonId)

  if ("error" in overview) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Caixa indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{overview.error}</p>
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

  // A chave troca quando o caixa abre ou fecha, para a tela remontar limpa.
  return <CashClient key={overview.open?.id ?? "closed"} salonId={salonId} overview={overview} />
}
