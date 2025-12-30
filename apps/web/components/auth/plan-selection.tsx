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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
          Escolha seu plano
        </h2>
        <p className="text-base text-slate-500 dark:text-slate-400">
          Selecione o plano ideal para o seu negócio. Sem fidelidade, cancele quando quiser.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan, index) => (
          <div
            key={index}
            className={`relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl transition-all duration-300 cursor-pointer hover:scale-105 ${
              plan.highlight
                ? 'ring-4 ring-indigo-600 dark:ring-indigo-500 shadow-2xl scale-105 z-10'
                : 'border border-slate-200 dark:border-white/5 shadow-lg hover:shadow-xl'
            } p-6`}
            onClick={() => handlePlanSelect(plan.name)}
          >
            {plan.highlight && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-600 dark:bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide shadow-md">
                Mais Popular
              </div>
            )}
            <div className="mb-4">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {plan.name}
              </h3>
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
            <button
              className={`w-full py-3 px-6 rounded-xl font-bold transition-colors ${
                plan.highlight
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'
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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 flex items-center justify-center p-4">
        <div className="max-w-5xl w-full">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-8 md:p-12">
            {content}
          </div>
          {onClose && (
            <div className="mt-6 text-center">
              <button
                onClick={onClose}
                className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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




