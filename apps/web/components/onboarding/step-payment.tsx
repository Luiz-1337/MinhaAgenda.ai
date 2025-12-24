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
  const { data, reset } = useOnboardingStore()
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
    setTimeout(() => {
      reset()
      onComplete()
    }, 1500)
  }

  if (isComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Pagamento processado!</h3>
        <p className="text-slate-500 dark:text-slate-400">Redirecionando para o dashboard...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Finalizar Cadastro</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Revise os detalhes do seu plano antes de finalizar.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
              <CreditCard size={20} className="text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 dark:text-white">Resumo do Plano</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Plano selecionado</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{planDetails.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {data.salonName || "Seu salão"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{planDetails.price}</p>
              {planDetails.period && (
                <p className="text-sm text-slate-500 dark:text-slate-400">/{planDetails.period}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Inclui:</p>
            <ul className="space-y-2">
              {planDetails.features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          <strong>Modo de teste:</strong> O pagamento está sendo simulado. 
          Em produção, você será redirecionado para um gateway de pagamento real.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold py-3.5 px-4 rounded-xl transition-all duration-200"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>
        <button
          onClick={handleFinish}
          disabled={isProcessing}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
