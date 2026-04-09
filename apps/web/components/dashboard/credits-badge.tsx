"use client"

import { useState, useEffect } from "react"
import { useSalon } from "@/contexts/salon-context"
import { getRemainingCredits } from "@/app/actions/credits"
import { formatCreditsInK, formatCreditsForDisplay } from "@/lib/utils"
import { Coins } from "lucide-react"

export function CreditsBadge() {
  const { activeSalon } = useSalon()
  const [credits, setCredits] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchCredits = async () => {
    if (!activeSalon?.id) {
      setIsLoading(false)
      return
    }

    try {
      const result = await getRemainingCredits(activeSalon.id)
      if ("error" in result) {
        console.error("Erro ao buscar créditos:", result.error)
        setCredits(null)
      } else {
        setCredits(result.remaining)
      }
    } catch (error) {
      console.error("Erro ao buscar créditos:", error)
      setCredits(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCredits()

    // Atualiza a cada 30 segundos
    const interval = setInterval(fetchCredits, 30000)

    return () => clearInterval(interval)
  }, [activeSalon?.id])

  // Não renderiza se não houver salão ativo
  if (!activeSalon) {
    return null
  }

  // Não renderiza se estiver carregando e não houver créditos ainda
  if (isLoading && credits === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground animate-pulse">
        <Coins size={16} />
        <span className="text-sm font-medium">---</span>
      </div>
    )
  }

  // Não renderiza se não houver créditos (erro ou dados inválidos)
  if (credits === null) {
    return null
  }

  const formattedCredits = formatCreditsInK(credits)
  const fullCredits = formatCreditsForDisplay(credits) + " créditos"

  return (
    <div className="relative group">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors cursor-help">
        <Coins size={16} className="text-accent" />
        <span className="text-sm font-medium">{formattedCredits}</span>
      </div>
      
      {/* Tooltip */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-muted text-foreground text-sm rounded-md shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none whitespace-nowrap z-20">
        <span className="font-medium">{fullCredits}</span>
        {/* Seta do tooltip */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1">
          <div className="w-2 h-2 bg-muted border-l border-t border-border rotate-45"></div>
        </div>
      </div>
    </div>
  )
}

