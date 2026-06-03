"use client"

import { useEffect } from "react"
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
import { Bot, AlertCircle, ArrowRight, Loader2 } from "lucide-react"

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

  const data = useOnboardingStore((s) => s.data)
  const currentStep = useOnboardingStore((s) => s.currentStep)
  const setData = useOnboardingStore((s) => s.setData)
  const setStep = useOnboardingStore((s) => s.setStep)
  const hasHydrated = useOnboardingStore((s) => s.hasHydrated)

  // Rehydrata o sessionStorage apenas no cliente (evita mismatch de hidratação SSR)
  useEffect(() => {
    useOnboardingStore.persist.rehydrate()
  }, [])

  const rawPlan = searchParams.get('plan')
  const VALID_PLANS = ['SOLO', 'PRO', 'ENTERPRISE']
  const isValidPlan = rawPlan && VALID_PLANS.includes(rawPlan.toUpperCase())
  const initialPlan = isValidPlan ? (rawPlan!.toUpperCase() as 'SOLO' | 'PRO' | 'ENTERPRISE') : undefined

  // Inicializar plan no store se veio pela URL (depois da hidratação)
  useEffect(() => {
    if (hasHydrated && initialPlan && !data.plan) {
      setData({ plan: initialPlan })
    }
  }, [hasHydrated, initialPlan, data.plan, setData])

  // Se plano inválido na URL
  if (rawPlan && !isValidPlan) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Plano não encontrado
          </h1>
          <p className="text-muted-foreground">
            O plano selecionado não existe ou o link está incorreto.
          </p>
          <button
            onClick={() => router.push('/#plans')}
            className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-accent-foreground bg-accent hover:bg-accent/90 transition-colors w-full sm:w-auto"
          >
            Ver Planos Disponíveis
            <ArrowRight className="ml-2 -mr-1 h-5 w-5" />
          </button>
        </div>
      </div>
    )
  }

  // Aguarda o sessionStorage hidratar para não renderizar o passo errado
  if (!hasHydrated) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    )
  }

  // Steps 1-4: apenas avançam (validação é feita dentro de cada Step)
  const handleStep1Next = () => setStep(2)
  const handleStep2Next = () => setStep(3)
  const handleStep3Next = () => setStep(4)
  const handleStep4Next = () => setStep(5)

  // Step 5: finalizar — cria tudo de uma vez após o pagamento (simulado) confirmado.
  // Retorna true só quando a conta foi realmente criada (o StepPayment depende disso
  // para não ficar preso na tela de sucesso).
  const handleStep5Complete = async (): Promise<boolean> => {
    // Lê direto do store para garantir que os dados não estão stale
    const storeData = useOnboardingStore.getState().data

    if (!storeData.email || !storeData.password || !storeData.salonName || !storeData.firstName || !storeData.lastName || !storeData.phone ||
      !storeData.billingAddress || !storeData.billingPostalCode || !storeData.billingCity || !storeData.billingState ||
      !storeData.documentType || !storeData.document || !storeData.plan) {
      toast.error("Dados incompletos. Por favor, preencha todos os campos obrigatórios.")
      return false
    }

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
      return false
    }

    if (result.success && result.data) {
      toast.success("Conta criada com sucesso! Redirecionando...")
      // Limpa o sessionStorage sem mexer no estado em memória (evita piscar o
      // passo 1 enquanto o dashboard carrega).
      useOnboardingStore.persist.clearStorage()
      // Novo salão entra em TRIAL — vai direto para o dashboard (o RouteGuard
      // libera o trial por prazo; o checkout fica disponível em Faturamento).
      router.push(`/${result.data.salonId}/dashboard`)
      return true
    }

    return false
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setStep(currentStep - 1)
    }
  }

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-md bg-accent flex items-center justify-center">
              <Bot className="text-accent-foreground" size={24} />
            </div>
            <span className="font-bold text-2xl text-foreground tracking-tight">
              minha<span className="text-accent">agenda</span>.ai
            </span>
          </div>
          <Stepper currentStep={currentStep} steps={STEPS} />
        </div>
      </div>

      {/* Content */}
      <div className={`mx-auto px-4 py-12 ${currentStep === 4 ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="bg-card rounded-lg border border-border p-8">
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
