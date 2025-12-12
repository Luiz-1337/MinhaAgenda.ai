"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Check, ChevronDown, Building2 } from "lucide-react"
import { useSalon } from "@/contexts/salon-context"
import { cn } from "@/lib/utils"

export function SalonSelector() {
  const { salons, activeSalon, setActiveSalon, isLoading } = useSalon()
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  // Se não há salões, não renderiza nada
  if (salons.length === 0) {
    return null
  }

  const handleSelectSalon = (salon: typeof salons[0]) => {
    setIsOpen(false)
    // Navega diretamente para a nova URL com o salonId
    const currentPath = window.location.pathname
    const routeMatch = currentPath.match(/^\/[^/]+(\/.*)?$/)
    const currentRoute = routeMatch ? (routeMatch[1] || "/dashboard") : "/dashboard"
    router.push(`/${salon.id}${currentRoute}`)
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-white transition-colors shadow-sm dark:shadow-none disabled:opacity-50"
          aria-label="Selecionar salão"
          aria-expanded={isOpen}
          aria-haspopup="true"
          disabled={isLoading}
        >
          <Building2 size={16} className="text-indigo-500 dark:text-indigo-400" />
          <span className="font-semibold">
            {activeSalon?.name || "Selecione um salão"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
        <DropdownMenuLabel className="text-slate-700 dark:text-slate-200">Meus Salões</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/10" />
        {salons.map((salon) => {
          const isActive = activeSalon?.id === salon.id
          return (
            <DropdownMenuItem
              key={salon.id}
              onClick={() => handleSelectSalon(salon)}
              className={cn(
                "flex items-center justify-between cursor-pointer text-slate-700 dark:text-slate-200",
                isActive && "bg-indigo-50 dark:bg-indigo-500/10"
              )}
              aria-selected={isActive}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Building2 className="size-4 shrink-0 opacity-50" />
                <span className="truncate">{salon.name}</span>
              </div>
              {isActive && <Check className="size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
            </DropdownMenuItem>
          )
        })}
        {salons.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-slate-500 dark:text-slate-400">
            Nenhum salão encontrado
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

