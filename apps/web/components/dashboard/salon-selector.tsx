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
          className="flex items-center gap-2 px-3 py-1.5 bg-sidebar-accent border border-sidebar-border rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent/80 transition-colors disabled:opacity-50"
          aria-label="Selecionar salão"
          aria-expanded={isOpen}
          aria-haspopup="true"
          disabled={isLoading}
        >
          <Building2 size={16} className="text-brand-blue" />
          <span className="font-medium">
            {activeSalon?.name || "Selecione um salão"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] bg-popover border-border">
        <DropdownMenuLabel>Meus Salões</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {salons.map((salon) => {
          const isActive = activeSalon?.id === salon.id
          return (
            <DropdownMenuItem
              key={salon.id}
              onClick={() => handleSelectSalon(salon)}
              className={cn(
                "flex items-center justify-between cursor-pointer",
                isActive && "bg-accent/10"
              )}
              aria-selected={isActive}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Building2 className="size-4 shrink-0 opacity-50" />
                <span className="truncate">{salon.name}</span>
              </div>
              {isActive && <Check className="size-4 shrink-0 text-accent" />}
            </DropdownMenuItem>
          )
        })}
        {salons.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Nenhum salão encontrado
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

