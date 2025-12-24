// Store simples usando localStorage (pode ser substituído por Zustand depois)
// Para instalar Zustand: pnpm add zustand

export interface OnboardingData {
  // Step 1: Account
  salonName?: string
  fullName?: string
  email?: string
  password?: string
  
  // Step 2: Legal
  documentType?: 'CPF' | 'CNPJ'
  document?: string
  
  // Step 3: Salon Details
  address?: string
  phone?: string
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

const STORAGE_KEY = 'onboarding-storage'

function getStorage(): { data: OnboardingData; currentStep: number } {
  if (typeof window === 'undefined') {
    return { data: {}, currentStep: 1 }
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore
  }
  return { data: {}, currentStep: 1 }
}

function setStorage(data: OnboardingData, currentStep: number) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, currentStep }))
  } catch {
    // Ignore
  }
}

export function useOnboardingStore() {
  const storage = getStorage()
  
  return {
    data: storage.data,
    currentStep: storage.currentStep,
    setData: (newData: Partial<OnboardingData>) => {
      const current = getStorage()
      const updated = { ...current.data, ...newData }
      setStorage(updated, current.currentStep)
      // Trigger re-render (simples, pode ser melhorado com eventos)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('onboarding-storage'))
      }
    },
    setStep: (step: number) => {
      const current = getStorage()
      setStorage(current.data, step)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('onboarding-storage'))
      }
    },
    reset: () => {
      if (typeof window === 'undefined') return
      localStorage.removeItem(STORAGE_KEY)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('onboarding-storage'))
      }
    },
  }
}
