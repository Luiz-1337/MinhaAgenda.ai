"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

export default function BillingPage() {
  const credits = "∞"
  const nextPayment = "15/12/2025"
  const planItems = [
    "1 canal WhatsApp",
    "Atendentes ilimitados",
    "Fila de espera inteligente",
    "Relatórios e métricas",
  ]

  function handleManageSubscription() {
    toast.info("Redirecionando para portal de assinatura...")
    // TODO: Implementar redirecionamento para portal de pagamento/assinatura
    // Exemplo: window.open("https://portal.assinatura.com", "_blank")
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
        <p className="text-muted-foreground">Gerencie sua assinatura e pagamentos</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-violet-600 text-lg font-semibold">Sua assinatura está Ativa</div>
              <p className="text-muted-foreground text-sm">Plano atual: Profissional</p>
            </div>
            <Button onClick={handleManageSubscription} className="bg-violet-600 text-white hover:bg-violet-700">Gerenciar Assinatura</Button>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="text-sm text-muted-foreground">Créditos disponíveis</div>
              <div className="text-3xl font-semibold">{credits}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Próximo pagamento</div>
              <div className="text-3xl font-semibold">{nextPayment}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <Badge className="bg-green-100 text-green-700 border-green-200">Ativo</Badge>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-medium">Itens do plano</div>
          <ul className="mt-3 space-y-2">
            {planItems.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="bg-violet-600 inline-block size-1.5 rounded-full" />
                <span className="text-sm">{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

