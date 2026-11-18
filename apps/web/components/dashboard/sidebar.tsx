"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/brand/logo"
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
  Trello,
  Plug,
  Receipt,
  Landmark,
  Percent,
  Boxes,
  Gift,
  Coins,
} from "lucide-react"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"
import type { ProfessionalRole } from "@/lib/types/professional"
import type { SalonListItem } from "@/lib/types/salon"

/**
 * Itens de módulo novo (docs/ROADMAP.md): aparecem só com o módulo ligado no salão
 * E a permissão de acesso. Não passam pela regra por cargo abaixo — nasceram com
 * permissão por recurso. É cortesia de tela; a trava é `can()` no servidor.
 */
const MODULE_ITEMS: Record<string, (salon: SalonListItem) => boolean> = {
  sales: (salon) => salon.modules.includes("sales") && salon.permissions.includes("sales.access"),
  finance: (salon) => salon.modules.includes("finance") && salon.permissions.includes("finance.access"),
  commissions: (salon) =>
    salon.modules.includes("commissions") && salon.permissions.includes("commissions.access"),
  // Quem só solicita produto (sem acessar o estoque) também entra: a página de
  // estoque manda essa pessoa direto para as solicitações.
  inventory: (salon) =>
    salon.modules.includes("inventory") &&
    (salon.permissions.includes("inventory.access") || salon.permissions.includes("inventory.request")),
  packages: (salon) => salon.modules.includes("packages") && salon.permissions.includes("packages.access"),
  cashback: (salon) => salon.modules.includes("cashback") && salon.permissions.includes("cashback.access"),
}

// Helper para verificar permissões de visualização
function shouldShowItem(href: string, role: ProfessionalRole, isSolo: boolean, salon: SalonListItem | null) {
  const moduleRule = MODULE_ITEMS[href]
  if (moduleRule) return salon ? moduleRule(salon) : false

  // 1. Staff: Acesso restrito
  // `contacts` entrou porque quem atende no balcão é justamente quem precisa
  // saber quem é o cliente. STAFF LÊ a lista e a ficha; não cria, não edita, não
  // exclui — a trava real é no servidor (canReadCrm vs hasSalonPermission).
  if (role === 'STAFF') {
    const allowed = ['schedule', 'chat', 'contacts']
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
      { href: "sales", label: "Comandas", icon: Receipt },
      { href: "finance", label: "Financeiro", icon: Landmark },
      { href: "commissions", label: "Comissões", icon: Percent },
      { href: "inventory", label: "Estoque", icon: Boxes },
      { href: "packages", label: "Pacotes", icon: Gift },
      { href: "cashback", label: "Cashback", icon: Coins },
    ]
  },
  {
    title: 'Operação Intelligence',
    items: [
      { href: "chat", label: "Conversas", icon: MessageSquare },
      { href: "kanban", label: "Kanban", icon: Trello },
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
      { href: "integrations", label: "Integrações", icon: Plug },
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
          const visibleItems = group.items.filter(item => shouldShowItem(item.href, role, isSolo, activeSalon))

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
            <Logo size="sm" textClassName="text-sidebar-foreground" />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <SidebarNav />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
