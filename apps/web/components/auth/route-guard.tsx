"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSalonAuth, useSalon } from "@/contexts/salon-context"
import { toast } from "sonner"

export function RouteGuard() {
  const pathname = usePathname()
  const router = useRouter()
  const { role } = useSalonAuth()
  const { activeSalon, isLoading } = useSalon()

  useEffect(() => {
    if (isLoading || !activeSalon || !pathname) return

    // Verifica permissões baseadas na rota
    const pathParts = pathname.split('/')
    // pathParts[0] is empty, [1] is salonId, [2] is section
    // Ex: /salon-id/settings -> ['', 'salon-id', 'settings']
    const section = pathParts[2]

    if (!section) return // Root /salon-id usually redirects to dashboard

    if (role === 'STAFF') {
      const forbiddenSections = ['dashboard', 'settings', 'team', 'services', 'billing', 'contacts', 'agents']
      if (forbiddenSections.includes(section)) {
        toast.error("Acesso negado para seu nível de permissão.")
        router.replace(`/${activeSalon.id}/schedule`)
      }
    }

    if (role === 'MANAGER') {
      const forbiddenSections = ['billing'] // Manager não vê faturamento
      if (forbiddenSections.includes(section)) {
        toast.error("Acesso negado para seu nível de permissão.")
        router.replace(`/${activeSalon.id}/dashboard`)
      }
    }

  }, [pathname, role, activeSalon, isLoading, router])

  return null
}





