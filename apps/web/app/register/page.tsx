"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useOnboardingStore } from "@/lib/stores/onboarding-store"
import { Stepper } from "@/components/onboarding/stepper"
import { StepCredentials } from "@/components/onboarding/step-credentials"
import { StepAccount } from "@/components/onboarding/step-account"
import { StepSalon } from "@/components/onboarding/step-salon"
import { StepPlan } from "@/components/onboarding/step-plan"
import { StepPayment } from "@/components/onboarding/step-payment"
import { completeOnboardingWithPayment } from "@/app/actions/onboarding"
import { toast } from "sonner"
import { Bot, AlertCircle, ArrowRight } from "lucide-react"

const STEPS = [
  { label: "Credenciais", description: "E-mail e senha" },
  { label: "Dados", description: "Informações pessoais" },
  { label: "Salão", description: "Detalhes do salão" },
  { label: "Plano", description: "Escolha seu plano" },
  { label: "Pagamento", description: "Finalizar" },
]

export default function RegisterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const store = useOnboardingStore()
  const [data, setDataState] = useState(store.data)
  const [currentStep, setStepState] = useState(store.currentStep)
  
  // Sincronizar com sessionStorage
  useEffect(() => {
    const handleStorage = () => {
      const updated = useOnboardingStore()
      setDataState(updated.data)
      setStepState(updated.currentStep)
    }
    
    window.addEventListener('onboarding-storage', handleStorage)
    
    // Limpar storage quando a aba for fechada (pagehide é mais confiável que beforeunload)
    const handlePageHide = () => {
      store.reset()
    }
    
    window.addEventListener('pagehide', handlePageHide)
    
    return () => {
      window.removeEventListener('onboarding-storage', handleStorage)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [store])
  
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
  const initialPlan = isValidPlan ? (rawPlan!.toUpperCase() as 'SOLO' | 'PRO' | 'ENTERPRISE') : undefined

  // Inicializar plan no store se veio pela URL
  useEffect(() => {
    if (initialPlan && !data.plan) {
      setData({ plan: initialPlan })
    }
  }, [initialPlan, data.plan, setData])

  // Se plano inválido na URL
  if (rawPlan && !isValidPlan) {
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

  // Step 1: Apenas validar credenciais (salvar no store, não criar usuário ainda)
  const handleStep1Next = async () => {
    if (!data.email || !data.password) {
      toast.error("E-mail e senha são obrigatórios")
      return
    }

    // Apenas validar e avançar - dados já foram salvos no store pelo StepCredentials
    setStep(2)
  }

  // Step 2: Preencher dados pessoais (apenas salva no store)
  const handleStep2Next = async () => {
    if (!data.salonName || !data.firstName || !data.lastName || !data.phone || 
        !data.billingAddress || !data.billingPostalCode || !data.billingCity || !data.billingState ||
        !data.documentType || !data.document) {
      toast.error("Preencha todos os campos obrigatórios")
      return
    }

    // Dados já foram salvos no store pelo StepAccount, apenas avança
    setStep(3)
  }

  // Step 3: Preencher dados do salão (apenas salva no store)
  const handleStep3Next = async () => {
    // Dados já foram salvos no store pelo StepSalon, apenas avança
    setStep(4)
  }

  // Step 4: Selecionar plano (apenas valida, não cria nada ainda)
  const handleStep4Next = async () => {
    if (!data.plan) {
      toast.error("Selecione um plano para continuar")
      return
    }

    if (!data.email || !data.password || !data.salonName || !data.firstName || !data.lastName || !data.phone || 
        !data.billingAddress || !data.billingPostalCode || !data.billingCity || !data.billingState ||
        !data.documentType || !data.document) {
      toast.error("Dados incompletos. Por favor, preencha todos os campos obrigatórios.")
      return
    }

    // Apenas validar e avançar - dados já foram salvos no store pelo StepPlan
    setStep(5)
  }

  // Step 5: Finalizar onboarding - criar tudo de uma vez após pagamento confirmado
  const handleStep5Complete = async () => {
    // Ler dados diretamente do store para garantir que não foram perdidos
    const storeData = store.data
    
    // Validar todos os dados obrigatórios
    if (!storeData.email || !storeData.password || !storeData.salonName || !storeData.firstName || !storeData.lastName || !storeData.phone || 
        !storeData.billingAddress || !storeData.billingPostalCode || !storeData.billingCity || !storeData.billingState ||
        !storeData.documentType || !storeData.document || !storeData.plan) {
      toast.error("Dados incompletos. Por favor, preencha todos os campos obrigatórios.")
      return
    }

    // Criar tudo de uma vez: usuário, perfil, salão e marcar onboarding como completo
    const result = await completeOnboardingWithPayment({
      email: storeData.email,
      password: storeData.password,
      salonName: storeData.salonName,
      firstName: storeData.firstName,
      lastName: storeData.lastName,
      phone: storeData.phone,
      plan: storeData.plan,
      billingAddress: storeData.billingAddress,
      billingPostalCode: storeData.billingPostalCode,
      billingCity: storeData.billingCity,
      billingState: storeData.billingState,
      billingCountry: storeData.billingCountry || 'BR',
      billingAddressComplement: storeData.billingAddressComplement,
      documentType: storeData.documentType,
      document: storeData.document,
      address: storeData.address,
      salonPhone: storeData.salonPhone,
      whatsapp: storeData.whatsapp,
      description: storeData.description,
      workHours: storeData.workHours,
      settings: storeData.settings,
    })

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    if (result.success && result.data) {
      toast.success("Conta criada com sucesso!")
      reset()
      // Redirecionar para o dashboard - o usuário já está autenticado pelo signUp
      router.push(`/${result.data.salonId}/dashboard`)
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
      <div className={`mx-auto px-4 py-12 ${currentStep === 4 ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-8">
          {currentStep === 1 && <StepCredentials onNext={handleStep1Next} />}
          {currentStep === 2 && <StepAccount onNext={handleStep2Next} onBack={handleBack} />}
          {currentStep === 3 && <StepSalon onNext={handleStep3Next} onBack={handleBack} />}
          {currentStep === 4 && <StepPlan onNext={handleStep4Next} onBack={handleBack} initialPlan={initialPlan} />}
          {currentStep === 5 && <StepPayment onComplete={handleStep5Complete} onBack={handleBack} />}
        </div>
      </div>
    </div>
  )
}
