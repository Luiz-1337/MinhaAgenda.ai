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
            className="w-full flex items-center justify-center gap-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-white py-2.5 px-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm transition-all duration-200 group"
          >
            <Plus size={16} className="text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-medium">Criar Novo Salão</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        {menuGroups.map((group, groupIndex) => {
          // Filtra itens baseados na role
          const visibleItems = group.items.filter(item => shouldShowItem(item.href, role, isSolo))

          if (visibleItems.length === 0) return null

          return (
            <div key={groupIndex} className="mb-6">
              <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-2 px-3">
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
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        active
                          ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
                      )}
                    >
                      <Icon size={18} />
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
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 transition-colors md:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0 bg-slate-50/80 dark:bg-slate-950/50 backdrop-blur-md border-slate-200 dark:border-white/5">
        <div className="flex flex-col h-full">
          {/* Brand */}
          <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Bot className="text-white" size={20} />
              </div>
              <span className="font-bold text-lg text-slate-800 dark:text-white tracking-tight">
                minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
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
