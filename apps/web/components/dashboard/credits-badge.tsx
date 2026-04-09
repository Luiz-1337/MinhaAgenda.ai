"use client"

import { useQuery } from "@tanstack/react-query"
import { useSalon } from "@/contexts/salon-context"
import { getRemainingCredits } from "@/app/actions/credits"
import { formatCreditsInK, formatCreditsForDisplay } from "@/lib/utils"
import { Coins } from "lucide-react"

export function CreditsBadge() {
  const { activeSalon } = useSalon()

  const { data: credits, isLoading } = useQuery({
    queryKey: ["credits", activeSalon?.id],
    queryFn: async () => {
      const result = await getRemainingCredits(activeSalon!.id)
      if ("error" in result) return null
      return result.remaining
    },
    enabled: !!activeSalon?.id,
    refetchInterval: 60_000, // 60s em vez de 30s
    staleTime: 30_000,
  })

  if (!activeSalon) return null

  if (isLoading && credits === undefined) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted text-muted-foreground animate-pulse">
        <Coins size={16} />
        <span className="text-sm font-medium">---</span>
      </div>
    )
  }

  if (credits === null || credits === undefined) return null

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

