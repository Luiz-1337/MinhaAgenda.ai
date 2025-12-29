"use client"

import { useState, useEffect } from "react"
import { Check, ArrowRight, ArrowLeft } from "lucide-react"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"
import { PLANS } from "@/components/landing/constants"

interface StepPlanProps {
  onNext: () => void
  onBack: () => void
  initialPlan?: 'SOLO' | 'PRO' | 'ENTERPRISE'
}

export function StepPlan({ onNext, onBack, initialPlan }: StepPlanProps) {
  const { data, setData } = useOnboardingStore()
  const [selectedPlan, setSelectedPlan] = useState<'SOLO' | 'PRO' | 'ENTERPRISE' | null>(
    (data.plan || initialPlan) as 'SOLO' | 'PRO' | 'ENTERPRISE' | null
  )

  // Mapeia os nomes dos planos da constante para os valores esperados
  const planMap: Record<string, 'SOLO' | 'PRO' | 'ENTERPRISE'> = {
    'Solo': 'SOLO',
    'Pro': 'PRO',
    'Enterprise': 'ENTERPRISE'
  }

  useEffect(() => {
    if (initialPlan && !selectedPlan) {
      setSelectedPlan(initialPlan)
      setData({ plan: initialPlan })
    }
  }, [initialPlan])

  const handlePlanSelect = (planName: string) => {
    const planValue = planMap[planName] || planName.toUpperCase() as 'SOLO' | 'PRO' | 'ENTERPRISE'
    
    // Enterprise não pode ser selecionado aqui (deve redirecionar antes)
    if (planValue === 'ENTERPRISE') {
      return
    }
    
    setSelectedPlan(planValue)
    setData({ plan: planValue })
  }

  const handleNext = () => {
    if (!selectedPlan) {
      return
    }
    onNext()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Escolha seu plano
        </h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Selecione o plano ideal para o seu negócio. Sem fidelidade, cancele quando quiser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan, index) => {
          const planValue = planMap[plan.name] || plan.name.toUpperCase() as 'SOLO' | 'PRO' | 'ENTERPRISE'
          const isSelected = selectedPlan === planValue
          const isEnterprise = planValue === 'ENTERPRISE'

          return (
            <div
              key={index}
              className={`relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl transition-all duration-300 cursor-pointer hover:scale-105 ${
                isSelected
                  ? 'ring-4 ring-indigo-600 dark:ring-indigo-500 shadow-2xl scale-105 z-10'
                  : plan.highlight
                  ? 'border-2 border-indigo-200 dark:border-indigo-800 shadow-lg'
                  : 'border border-slate-200 dark:border-white/5 shadow-lg hover:shadow-xl'
              } p-6`}
              onClick={() => !isEnterprise && handlePlanSelect(plan.name)}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md">
                  Mais Popular
                </div>
              )}
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                </div>
              )}
              <div className="mb-4">
                <h4 className="text-xl font-bold text-slate-900 dark:text-white">
                  {plan.name}
                </h4>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm h-10">
                  {plan.description}
                </p>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {plan.price}
                </span>
                {plan.price !== 'Sob Consulta' && (
                  <span className="text-slate-500 dark:text-slate-400 font-medium">/mês</span>
                )}
              </div>
              <ul className="mb-6 space-y-3 flex-1">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600 dark:text-slate-300 text-sm">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              {!isEnterprise && (
                <button
                  className={`w-full py-3 px-6 rounded-xl font-bold transition-colors ${
                    isSelected || plan.highlight
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-lg shadow-indigo-600/30'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlanSelect(plan.name)
                  }}
                >
                  {isSelected ? 'Selecionado' : 'Selecionar'}
                </button>
              )}
              {isEnterprise && (
                <button
                  className="w-full py-3 px-6 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePlanSelect(plan.name)
                  }}
                >
                  {plan.buttonText}
                </button>
              )}
            </div>
          )
        })}
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
          onClick={handleNext}
          disabled={!selectedPlan}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <span>Continuar</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

