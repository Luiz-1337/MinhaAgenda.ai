"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Menu,
  MessageSquare,
  Bot,
  CreditCard,
  User,
  Plus,
  Calendar,
  Briefcase,
  Zap,
  Package,
  Megaphone,
} from "lucide-react"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"
import type { ProfessionalRole } from "@/lib/types/professional"

// Helper para verificar permissões de visualização
function shouldShowItem(href: string, role: ProfessionalRole, isSolo: boolean) {
  // 1. Staff: Acesso restrito
  if (role === 'STAFF') {
    const allowed = ['schedule', 'chat']
    return allowed.includes(href)
  }

  // 2. Manager (Dono/Admin)
  if (role === 'MANAGER') {
    // Se for SOLO, esconde funcionalidades de equipe
    if (isSolo) {
      if (href === 'team') return false
    }
    // Manager tem acesso total (exceto o que foi filtrado acima)
    return true
  }

  return false
}

const menuGroups = [
  {
    title: 'Visão Geral',
    items: [
      { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "schedule", label: "Agenda", icon: Calendar },
    ]
  },
  {
    title: 'Operação Intelligence',
    items: [
      { href: "chat", label: "Conversas", icon: MessageSquare },
      { href: "agents", label: "Agentes AI", icon: Bot },
      { href: "contacts", label: "Contatos", icon: User },
      { href: "team", label: "Equipe", icon: Briefcase },
    ]
  },
  {
    title: 'Gestão & Ajustes',
    items: [
      { href: "billing", label: "Faturamento", icon: CreditCard },
      { href: "services", label: "Serviços", icon: Zap },
      { href: "products", label: "Produtos", icon: Package },
      { href: "marketing", label: "Marketing", icon: Megaphone },
    ]
  }
] as const

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { activeSalon } = useSalon()
  const { role, isSolo } = useSalonAuth()

  const handleCreateSalon = () => {
    router.push("/onboarding")
  }

  // Função para construir href com salonId
  const buildHref = (baseHref: string) => {
    if (!activeSalon) return `/${baseHref}`
    if (baseHref === "dashboard") {
      return `/${activeSalon.id}/dashboard`
    }
    return `/${activeSalon.id}/${baseHref}`
  }

  // Verifica se um item está ativo
  const isActive = (href: string) => {
    const hrefWithSalon = buildHref(href)
    return pathname === hrefWithSalon ||
      (href !== "dashboard" && pathname?.startsWith(`/${activeSalon?.id}/${href}`)) ||
      (href === "dashboard" && pathname?.startsWith(`/${activeSalon?.id}/dashboard`))
  }

  return (
    <>
      {/* Action Button */}
      {!isSolo && (
        <div className="p-4">
          <button
            onClick={handleCreateSalon}
            className="w-full flex items-center justify-center gap-2 bg-transparent hover:bg-sidebar-accent text-sidebar-foreground py-2 px-4 rounded-md border border-sidebar-border transition-all duration-150 group"
          >
            <Plus size={16} className="text-brand-blue group-hover:scale-110 transition-transform" />
            <span className="text-sm font-light">Criar Novo Salão</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
        {menuGroups.map((group, groupIndex) => {
          // Filtra itens baseados na role
          const visibleItems = group.items.filter(item => shouldShowItem(item.href, role, isSolo))

          if (visibleItems.length === 0) return null

          return (
            <div key={groupIndex} className="mb-5">
              <h4 className="text-[10px] uppercase tracking-wider font-bold text-sidebar-foreground/40 mb-2 px-3">
                {group.title}
              </h4>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={buildHref(item.href)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-150",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-normal"
                          : "text-sidebar-foreground/70 font-light hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </>
  )
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          className="p-2 rounded-md hover:bg-sidebar-accent/50 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors md:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[220px] p-0 bg-sidebar border-sidebar-border">
        <div className="flex flex-col h-full">
          {/* Brand */}
          <div className="h-11 flex items-center px-5 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-brand-blue flex items-center justify-center">
                <Bot className="text-accent-foreground" size={18} />
              </div>
              <span className="font-bold text-base text-sidebar-foreground tracking-tight">
                minha<span className="text-brand-blue">agenda</span>.ai
              </span>
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <SidebarNav />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
