"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter, usePathname, useParams } from "next/navigation"
import type { SalonListItem } from "@/app/actions/salon"
import { getUserSalons } from "@/app/actions/salon"

interface SalonContextType {
  salons: SalonListItem[]
  activeSalon: SalonListItem | null
  setActiveSalon: (salon: SalonListItem | null) => void
  isLoading: boolean
  refreshSalons: () => Promise<void>
}

const SalonContext = createContext<SalonContextType | undefined>(undefined)

export function SalonProvider({ children, initialSalons }: { children: ReactNode; initialSalons: SalonListItem[] }) {
  const [salons, setSalons] = useState<SalonListItem[]>(initialSalons)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()

  // Lê o salão ativo do pathname (formato: /[salonId]/dashboard/...)
  const salonIdFromPath = params?.salonId as string | undefined
  
  // Encontra o salão ativo baseado no pathname
  const activeSalon = salonIdFromPath 
    ? salons.find((s) => s.id === salonIdFromPath) || (salons.length > 0 ? salons[0] : null)
    : (salons.length > 0 ? salons[0] : null)

  // Atualiza a URL quando o salão muda
  const setActiveSalon = useCallback((salon: SalonListItem | null) => {
    if (salon && pathname) {
      // Extrai a rota atual sem o salonId (ex: /[salonId]/dashboard/chat -> /dashboard/chat)
      const routeMatch = pathname.match(/^\/[^/]+(\/.*)?$/)
      const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
      
      // Navega para a nova URL com o novo salonId
      router.replace(`/${salon.id}${currentRoute}`, { scroll: false })
    } else if (salons.length > 0 && pathname) {
      // Se não há salão selecionado, redireciona para o primeiro
      const routeMatch = pathname.match(/^\/[^/]+(\/.*)?$/)
      const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
      router.replace(`/${salons[0].id}${currentRoute}`, { scroll: false })
    }
  }, [router, pathname, salons])

  // Se não há salonId no path mas há salões, redireciona para o primeiro
  useEffect(() => {
    if (!salonIdFromPath && salons.length > 0 && pathname && !pathname.startsWith("/login") && !pathname.startsWith("/register") && !pathname.startsWith("/onboarding")) {
      const routeMatch = pathname.match(/^\/[^/]+(\/.*)?$/)
      const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
      router.replace(`/${salons[0].id}${currentRoute}`)
    }
  }, [salonIdFromPath, salons, pathname, router])

  const refreshSalons = useCallback(async () => {
    setIsLoading(true)
    try {
      const updatedSalons = await getUserSalons()
      setSalons(updatedSalons)
      
      // Mantém o salão ativo do path se ele ainda existir
      const currentSalonId = params?.salonId as string | undefined
      if (currentSalonId && updatedSalons.length > 0) {
        const currentSalon = updatedSalons.find((s) => s.id === currentSalonId)
        if (!currentSalon && pathname) {
          // Se o salão não existe mais, redireciona para o primeiro
          const routeMatch = pathname.match(/^\/[^/]+(\/.*)?$/)
          const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
          router.replace(`/${updatedSalons[0].id}${currentRoute}`)
        }
      } else if (updatedSalons.length > 0 && pathname && !pathname.startsWith("/login") && !pathname.startsWith("/register") && !pathname.startsWith("/onboarding")) {
        // Se não há salão no path, redireciona para o primeiro
        const routeMatch = pathname.match(/^\/[^/]+(\/.*)?$/)
        const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
        router.replace(`/${updatedSalons[0].id}${currentRoute}`)
      }
    } catch (error) {
      console.error("Erro ao atualizar salões:", error)
    } finally {
      setIsLoading(false)
    }
  }, [params, pathname, router])

  return (
    <SalonContext.Provider value={{ salons, activeSalon, setActiveSalon, isLoading, refreshSalons }}>
      {children}
    </SalonContext.Provider>
  )
}

export function useSalon() {
  const context = useContext(SalonContext)
  if (context === undefined) {
    throw new Error("useSalon deve ser usado dentro de um SalonProvider")
  }
  return context
}

