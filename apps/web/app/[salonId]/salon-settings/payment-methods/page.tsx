import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { listPaymentMethods } from "@/app/actions/payment-methods"
import { getSessionUserId } from "@/lib/supabase/auth"
import { can } from "@/lib/services/permissions.service"
import { PaymentMethodsClient } from "./payment-methods-client"

export default async function PaymentMethodsPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // A action confere sessão, módulo ligado e permissão. Sem acesso, a página mostra
  // o bloqueio no conteúdo — o menu continua onde está.
  const methods = await listPaymentMethods(salonId)

  if ("error" in methods) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Sem permissão</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{methods.error}</p>
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

  // Só para esconder os botões de quem apenas consulta; as actions conferem de novo.
  const userId = await getSessionUserId()
  const canManage = userId ? await can(salonId, userId, "payment_methods.manage") : false

  return <PaymentMethodsClient key={salonId} salonId={salonId} methods={methods} canManage={canManage} />
}
