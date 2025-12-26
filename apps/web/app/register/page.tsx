"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"
import { Stepper } from "@/components/onboarding/stepper"
import { StepCredentials } from "@/components/onboarding/step-credentials"
import { StepAccount } from "@/components/onboarding/step-account"
import { StepSalon } from "@/components/onboarding/step-salon"
import { StepPayment } from "@/components/onboarding/step-payment"
import { onboardingStep1, onboardingStep3, onboardingStep4, createUserWithCredentials } from "@/app/actions/onboarding"
import { toast } from "sonner"
import { Bot, AlertCircle, ArrowRight } from "lucide-react"

const STEPS = [
  { label: "Credenciais", description: "E-mail e senha" },
  { label: "Dados", description: "Informações pessoais" },
  { label: "Salão", description: "Detalhes do salão" },
  { label: "Pagamento", description: "Finalizar" },
]

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const store = useOnboardingStore()
  const [data, setDataState] = useState(store.data)
  const [currentStep, setStepState] = useState(store.currentStep)
  
  // Sincronizar com localStorage
  useEffect(() => {
    const handleStorage = () => {
      const updated = useOnboardingStore()
      setDataState(updated.data)
      setStepState(updated.currentStep)
    }
    
    window.addEventListener('onboarding-storage', handleStorage)
    return () => window.removeEventListener('onboarding-storage', handleStorage)
  }, [])
  
  const setData = (newData: Partial<typeof data>) => {
    store.setData(newData)
    setDataState({ ...data, ...newData })
  }
  
  const setStep = (step: number) => {
    store.setStep(step)
    setStepState(step)
  }
  
  const reset = () => {
    store.reset()
    setDataState({})
    setStepState(1)
  }
  
  const rawPlan = searchParams.get('plan')
  const VALID_PLANS = ['SOLO', 'PRO', 'ENTERPRISE']
  const isValidPlan = rawPlan && VALID_PLANS.includes(rawPlan.toUpperCase())
  const plan = isValidPlan ? (rawPlan!.toUpperCase() as 'SOLO' | 'PRO' | 'ENTERPRISE') : 'SOLO'

  // Redirecionar Enterprise
  useEffect(() => {
    if (plan === 'ENTERPRISE') {
      router.push('/contact?reason=enterprise_plan')
    }
  }, [plan, router])

  // Inicializar plan no store
  useEffect(() => {
    if (plan && !data.plan) {
      setData({ plan })
    }
  }, [plan, data.plan, setData])

  // Se plano inválido
  if (!isValidPlan && rawPlan) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Plano não encontrado
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            O plano selecionado não existe ou o link está incorreto.
          </p>
          <button 
            onClick={() => router.push('/#plans')}
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition-colors w-full sm:w-auto"
          >
            Ver Planos Disponíveis
            <ArrowRight className="ml-2 -mr-1 h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  // Step 1: Criar usuário apenas com credenciais
  const handleStep1Next = async () => {
    if (!data.email || !data.password) {
      toast.error("E-mail e senha são obrigatórios")
      return
    }

    const result = await createUserWithCredentials({
      email: data.email,
      password: data.password,
    })

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    if (result.success && result.data) {
      setData({
        userId: result.data.userId,
      })
      setStep(2)
    }
  }

  // Step 2: Preencher dados pessoais e criar perfil/salão
  const handleStep2Next = async () => {
    if (!data.userId || !data.salonName || !data.firstName || !data.lastName || !data.phone || 
        !data.billingAddress || !data.billingPostalCode || !data.billingCity || !data.billingState ||
        !data.documentType || !data.document) {
      toast.error("Preencha todos os campos obrigatórios")
      return
    }

    const result = await onboardingStep1({
      userId: data.userId,
      salonName: data.salonName,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      plan: plan,
      billingAddress: data.billingAddress,
      billingPostalCode: data.billingPostalCode,
      billingCity: data.billingCity,
      billingState: data.billingState,
      billingCountry: data.billingCountry || 'BR',
      billingAddressComplement: data.billingAddressComplement,
      documentType: data.documentType,
      document: data.document,
    })

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    if (result.success && result.data) {
      setData({
        salonId: result.data.salonId,
      })
      setStep(3)
    }
  }

  const handleStep3Next = async () => {
    if (!data.salonId) {
      toast.error("Erro: Salão não encontrado")
      return
    }

    const result = await onboardingStep3({
      salonId: data.salonId,
      address: data.address,
      salonPhone: data.salonPhone,
      whatsapp: data.whatsapp,
      description: data.description,
      workHours: data.workHours,
      settings: data.settings,
    })

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    if (result.success) {
      setStep(4)
    }
  }

  const handleComplete = async () => {
    if (!data.salonId) {
      toast.error("Erro: Salão não encontrado")
      return
    }

    const result = await onboardingStep4(data.salonId)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    if (result.success) {
      toast.success("Onboarding concluído com sucesso!")
      reset()
      router.push(`/${data.salonId}/dashboard`)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setStep(currentStep - 1)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Bot className="text-white" size={24} />
            </div>
            <span className="font-bold text-2xl text-slate-800 dark:text-white tracking-tight">
              minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
            </span>
          </div>
          <Stepper currentStep={currentStep} steps={STEPS} />
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-8">
          {currentStep === 1 && <StepCredentials onNext={handleStep1Next} />}
          {currentStep === 2 && <StepAccount onNext={handleStep2Next} onBack={handleBack} />}
          {currentStep === 3 && <StepSalon onNext={handleStep3Next} onBack={handleBack} />}
          {currentStep === 4 && <StepPayment onComplete={handleComplete} onBack={handleBack} />}
        </div>
      </div>
    </div>
  )
}
