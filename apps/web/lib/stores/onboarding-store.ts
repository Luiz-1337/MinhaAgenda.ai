// Store do fluxo de cadastro (/register).
// Usa Zustand com persistência em sessionStorage (limpa quando a aba é fechada).
// `skipHydration` + rehydrate manual evita mismatch de hidratação SSR no Next.js.

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export interface OnboardingData {
  // Step 1: Account
  salonName?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  password?: string
  // Endereço de cobrança
  billingAddress?: string
  billingPostalCode?: string
  billingCity?: string
  billingState?: string
  billingCountry?: string
  billingAddressComplement?: string

  // Step 2: Legal
  documentType?: 'CPF' | 'CNPJ'
  document?: string
  documentNumber?: string

  // Step 3: Salon Details
  address?: string
  salonPhone?: string
  whatsapp?: string
  description?: string
  workHours?: Record<string, { start: string; end: string }>
  settings?: {
    accepts_card?: boolean
    parking?: boolean
    late_tolerance_minutes?: number
  }

  // Step 4: Payment
  plan?: 'SOLO' | 'PRO' | 'ENTERPRISE'

  // Internal
  userId?: string
  salonId?: string
}

interface OnboardingState {
  data: OnboardingData
  currentStep: number
  /** true após o rehydrate do sessionStorage concluir (usado para evitar flash/mismatch) */
  hasHydrated: boolean
  setData: (newData: Partial<OnboardingData>) => void
  setStep: (step: number) => void
  reset: () => void
  setHasHydrated: (value: boolean) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      data: {},
      currentStep: 1,
      hasHydrated: false,
      setData: (newData) =>
        set((state) => ({ data: { ...state.data, ...newData } })),
      setStep: (step) => set({ currentStep: step }),
      reset: () => set({ data: {}, currentStep: 1 }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "onboarding-storage",
      storage: createJSONStorage(() => sessionStorage),
      // Hidrata manualmente no cliente (ver useEffect em register/page.tsx)
      skipHydration: true,
      // Persiste apenas os dados do fluxo, nunca a flag de hidratação
      partialize: (state) => ({ data: state.data, currentStep: state.currentStep }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
