"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSalonAuth, useSalon } from "@/contexts/salon-context"
import { toast } from "sonner"

/**
 * Duração da janela de trial (em dias) liberada para salões com status TRIAL.
 * Após esse prazo o acesso é bloqueado até a assinatura ser ativada.
 */
const TRIAL_DURATION_DAYS = 7

export function RouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, isSolo } = useSalonAuth()
  const { activeSalon, isLoading } = useSalon()

  useEffect(() => {
    if (isLoading || !activeSalon || !pathname) return

    // Verifica permissões baseadas na rota
    const pathParts = pathname.split('/')
    // pathParts[0] is empty, [1] is salonId, [2] is section
    // Ex: /salon-id/settings -> ['', 'salon-id', 'settings']
    const section = pathParts[2]

    if (!section) return // Root /salon-id usually redirects to dashboard

    // Guard de assinatura: bloqueia o acesso (exceto /expired e /billing) quando o
    // salão não está pago. TRIAL é liberado por uma janela de TRIAL_DURATION_DAYS dias.
    const allowedWhenExpired = ['expired', 'billing']
    const status = activeSalon.subscriptionStatus

    const isTrialActive = (): boolean => {
      if (status !== 'TRIAL') return false
      const changedAt = activeSalon.subscriptionStatusChangedAt
      // Sem data registrada: trata como recém-criado (fail-open, não tranca o usuário)
      if (!changedAt) return true
      const start = new Date(changedAt).getTime()
      if (Number.isNaN(start)) return true
      const expiresAt = start + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000
      return Date.now() < expiresAt
    }

    const needsActiveSubscription =
      status === 'CANCELED' ||
      status === 'PAST_DUE' ||
      (status === 'TRIAL' && !isTrialActive())

    if (needsActiveSubscription && !allowedWhenExpired.includes(section)) {
      router.replace(`/${activeSalon.id}/expired`)
      return
    }

    if (role === 'STAFF') {
      const forbiddenSections = ['dashboard', 'settings', 'team', 'services', 'billing', 'contacts', 'agents']
      if (forbiddenSections.includes(section)) {
        toast.error("Acesso negado para seu nível de permissão.")
        router.replace(`/${activeSalon.id}/schedule`)
      }
    }

    // Billing acessível para qualquer MANAGER (SOLO, PRO, ENTERPRISE)

  }, [pathname, role, isSolo, activeSalon, isLoading, router])

  return null
}








