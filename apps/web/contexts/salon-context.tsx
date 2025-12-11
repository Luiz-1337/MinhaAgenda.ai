"use client"

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
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
  const searchParams = useSearchParams()

  // Lê o salão ativo da URL
  const salonIdFromUrl = searchParams.get("salonId")
  
  // Encontra o salão ativo baseado na URL
  const activeSalon = salonIdFromUrl 
    ? salons.find((s) => s.id === salonIdFromUrl) || (salons.length > 0 ? salons[0] : null)
    : (salons.length > 0 ? salons[0] : null)

  // Atualiza a URL quando o salão muda
  const setActiveSalon = useCallback((salon: SalonListItem | null) => {
    if (salon && pathname) {
      const params = new URLSearchParams(searchParams.toString())
      params.set("salonId", salon.id)
      // Usa replace para não adicionar ao histórico e forçar atualização
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    } else if (pathname) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("salonId")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }, [router, pathname, searchParams])

  // Se não há salonId na URL mas há salões, adiciona o primeiro
  useEffect(() => {
    if (!salonIdFromUrl && salons.length > 0 && pathname) {
      const params = new URLSearchParams(searchParams.toString())
      params.set("salonId", salons[0].id)
      router.replace(`${pathname}?${params.toString()}`)
    }
  }, [salonIdFromUrl, salons, pathname, searchParams, router])

  const refreshSalons = useCallback(async () => {
    setIsLoading(true)
    try {
      const updatedSalons = await getUserSalons()
      setSalons(updatedSalons)
      
      // Mantém o salão ativo da URL se ele ainda existir
      const currentSalonId = searchParams.get("salonId")
      if (currentSalonId && updatedSalons.length > 0) {
        const currentSalon = updatedSalons.find((s) => s.id === currentSalonId)
        if (!currentSalon && pathname) {
          // Se o salão não existe mais, atualiza para o primeiro
          const params = new URLSearchParams(searchParams.toString())
          params.set("salonId", updatedSalons[0].id)
          router.replace(`${pathname}?${params.toString()}`)
        }
      } else if (updatedSalons.length > 0 && pathname) {
        // Se não há salão na URL, adiciona o primeiro
        const params = new URLSearchParams(searchParams.toString())
        params.set("salonId", updatedSalons[0].id)
        router.replace(`${pathname}?${params.toString()}`)
      }
    } catch (error) {
      console.error("Erro ao atualizar salões:", error)
    } finally {
      setIsLoading(false)
    }
  }, [searchParams, pathname, router])

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

