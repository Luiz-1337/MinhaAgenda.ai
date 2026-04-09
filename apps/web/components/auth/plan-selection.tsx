"use client"

import React from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { PLANS } from '@/components/landing/constants'

interface PlanSelectionProps {
  variant?: 'dialog' | 'page'
  onClose?: () => void
}

export function PlanSelection({ variant = 'dialog', onClose }: PlanSelectionProps) {
  const router = useRouter()

  const handlePlanSelect = (planName: string) => {
    // Mapeia os nomes dos planos para os valores esperados pela API
    const planMap: Record<string, string> = {
      'Solo': 'SOLO',
      'Pro': 'PRO',
      'Enterprise': 'ENTERPRISE'
    }
    
    const planParam = planMap[planName] || planName.toUpperCase()
    
    // Enterprise redireciona para contato
    if (planParam === 'ENTERPRISE') {
      router.push('/contact?reason=enterprise_plan')
    } else {
      router.push(`/register?plan=${planParam}`)
    }
  }

  const content = (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          Escolha seu plano
        </h2>
        <p className="text-base text-muted-foreground">
          Selecione o plano ideal para o seu negócio. Sem fidelidade, cancele quando quiser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan, index) => (
          <div
            key={index}
            className={`relative flex flex-col bg-card rounded-md transition-all duration-300 cursor-pointer ${
              plan.highlight
                ? 'ring-4 ring-accent z-10'
                : 'border border-border'
            } p-6`}
            onClick={() => handlePlanSelect(plan.name)}
          >
            {plan.highlight && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-accent text-accent-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                Mais Popular
              </div>
            )}
            <div className="mb-4">
              <h3 className="text-xl font-bold text-foreground">
                {plan.name}
              </h3>
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
            <button
              className={`w-full py-3 px-6 rounded-md font-bold transition-colors ${
                plan.highlight
                  ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                handlePlanSelect(plan.name)
              }}
            >
              {plan.buttonText}
            </button>
          </div>
        ))}
      </div>
    </>
  )

  if (variant === 'page') {
    return (
      <div className="min-h-screen bg-background transition-colors duration-300 flex items-center justify-center p-4">
        <div className="max-w-5xl w-full">
          <div className="bg-card rounded-lg border border-border p-8 md:p-12">
            {content}
          </div>
          {onClose && (
            <div className="mt-6 text-center">
              <button
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Voltar para login
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return content
}







