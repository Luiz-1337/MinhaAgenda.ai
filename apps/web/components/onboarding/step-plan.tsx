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
        <h3 className="text-xl font-bold text-foreground mb-2">
          Escolha seu plano
        </h3>
        <p className="text-muted-foreground text-sm">
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
              className={`relative flex flex-col bg-card rounded-md transition-all duration-300 cursor-pointer ${
                isSelected
                  ? 'ring-4 ring-accent z-10'
                  : plan.highlight
                  ? 'border-2 border-accent/40'
                  : 'border border-border'
              } p-6`}
              onClick={() => !isEnterprise && handlePlanSelect(plan.name)}
            >
              {plan.highlight && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                  Mais Popular
                </div>
              )}
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-4 h-4 text-accent-foreground" />
                  </div>
                </div>
              )}
              <div className="mb-4">
                <h4 className="text-xl font-bold text-foreground">
                  {plan.name}
                </h4>
                <p className="text-muted-foreground mt-2 text-sm h-10">
                  {plan.description}
                </p>
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-foreground">
                  {plan.price}
                </span>
                {plan.price !== 'Sob Consulta' && (
                  <span className="text-muted-foreground font-medium">/mês</span>
                )}
              </div>
              <ul className="mb-6 space-y-3 flex-1">
                {plan.features.map((feature, fIndex) => (
                  <li key={fIndex} className="flex items-start">
                    <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-muted-foreground text-sm">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              {!isEnterprise && (
                <button
                  className={`w-full py-3 px-6 rounded-md font-bold transition-colors ${
                    isSelected || plan.highlight
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                      : 'bg-muted text-foreground hover:bg-muted/80'
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
                  className="w-full py-3 px-6 rounded-md font-bold bg-muted text-foreground hover:bg-muted/80"
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
          className="flex-1 flex items-center justify-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200"
        >
          <ArrowLeft size={18} />
          Voltar
        </button>
        <button
          onClick={handleNext}
          disabled={!selectedPlan}
          className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold py-3.5 px-4 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Continuar</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  )
}

