import { ShieldOff } from "lucide-react"
import { getCommissionPayments } from "@/app/actions/commissions"
import { CommissionPaymentsClient } from "./commission-payments-client"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Pagamento de comissões (docs/ROADMAP.md, fase 3, fatia 3d): o que está em aberto
 * até um dia, por profissional, e os pagamentos já feitos.
 */
export default async function CommissionPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão. Sem "ver de todos", a pessoa vê só
  // o que é dela — em aberto e pago.
  const data = await getCommissionPayments(salonId, {
    until: first(query.until) || undefined,
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
  })

  if ("error" in data) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Pagamentos indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{data.error}</p>
      </div>
    )
  }

  return (
    <CommissionPaymentsClient
      // Trocar a data de corte remonta a seleção: o que estava marcado era de outra soma.
      key={`${data.until}:${data.from}:${data.to}`}
      salonId={salonId}
      data={data}
    />
  )
}
