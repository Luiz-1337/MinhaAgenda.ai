"use client"

import { useState } from "react"
import { CreditCard, CheckCircle2, Loader2, ArrowRight, ArrowLeft } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"

interface StepPaymentProps {
  onComplete: () => void
  onBack: () => void
}

const PLAN_DETAILS = {
  SOLO: {
    name: "Solo",
    price: "R$ 49",
    period: "mês",
    features: [
      "1 Salão",
      "Agendamentos ilimitados",
      "IA para atendimento",
      "Integração WhatsApp",
      "Suporte por email",
    ],
  },
  PRO: {
    name: "Pro",
    price: "R$ 149",
    period: "mês",
    features: [
      "3 Salões",
      "Agendamentos ilimitados",
      "IA avançada",
      "Integração WhatsApp",
      "Suporte prioritário",
      "Relatórios avançados",
    ],
  },
  ENTERPRISE: {
    name: "Enterprise",
    price: "Personalizado",
    period: "",
    features: [
      "Salões ilimitados",
      "Agendamentos ilimitados",
      "IA personalizada",
      "Integração completa",
      "Suporte dedicado",
      "API personalizada",
    ],
  },
}

export function StepPayment({ onComplete, onBack }: StepPaymentProps) {
  const { data } = useOnboardingStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const plan = data.plan || "SOLO"
  const planDetails = PLAN_DETAILS[plan]

  const handleFinish = async () => {
    setIsProcessing(true)
    
    // Simular processamento de pagamento
    await new Promise((resolve) => setTimeout(resolve, 2000))
    
    setIsProcessing(false)
    setIsComplete(true)
    
    // Aguardar um pouco antes de redirecionar
    // Não limpar o store aqui - será limpo após sucesso no handleStep5Complete
    setTimeout(() => {
      onComplete()
    }, 1500)
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="text-xl font-semibold text-foreground">Pagamento processado!</h3>
        <p className="text-muted-foreground">Redirecionando para o dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-foreground mb-2">Finalizar Cadastro</h3>
        <p className="text-muted-foreground text-sm">Revise os detalhes do seu plano antes de finalizar.</p>
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="p-6 border-b border-border bg-muted">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-md border border-accent/20">
              <CreditCard size={20} className="text-accent" />
            </div>
            <div>
              <h4 className="font-bold text-foreground">Resumo do Plano</h4>
              <p className="text-xs text-muted-foreground">Plano selecionado</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-accent/10 rounded-md border border-accent/20">
            <div>
              <p className="font-semibold text-foreground">{planDetails.name}</p>
              <p className="text-sm text-muted-foreground">
                {data.salonName || "Seu salão"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-accent">{planDetails.price}</p>
              {planDetails.period && (
                <p className="text-sm text-muted-foreground">/{planDetails.period}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Inclui:</p>
            <ul className="space-y-2">
              {planDetails.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-700/20 dark:border-amber-300/20 rounded-md">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          <strong>Modo de teste:</strong> O pagamento está sendo simulado. 
          Em produção, você será redirecionado para um gateway de pagamento real.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>
        <button
          onClick={handleFinish}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <span>Finalizar Setup</span>
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
