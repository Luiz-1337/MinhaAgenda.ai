"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Coins,
  Menu,
  Shield,
  ScrollText,
} from "lucide-react"

const menuGroups = [
  {
    title: 'Visão Geral',
    items: [
      { href: "/z_admin_minhaagendaai", label: "Dashboard", icon: LayoutDashboard },
    ]
  },
  {
    title: 'Gestão',
    items: [
      { href: "/z_admin_minhaagendaai/users", label: "Usuários", icon: Users },
      { href: "/z_admin_minhaagendaai/plans", label: "Planos", icon: CreditCard },
      { href: "/z_admin_minhaagendaai/tokens", label: "Tokens", icon: Coins },
      { href: "/z_admin_minhaagendaai/audit", label: "Auditoria", icon: ScrollText },
    ]
  },
] as const

// Mesma identidade visual do sistema principal (quadrado brand-blue + wordmark),
// com um selo "Admin" discreto para sinalizar a área.
function AdminBrand() {
  return (
    <div className="h-11 flex items-center px-5 border-b border-sidebar-border">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-brand-blue flex items-center justify-center">
          <Shield className="text-accent-foreground" size={18} />
        </div>
        <span className="font-bold text-base text-sidebar-foreground tracking-tight">
          minha<span className="text-brand-blue">agenda</span>.ai
        </span>
        <span className="ml-1 text-[9px] uppercase tracking-wider font-bold text-sidebar-foreground/50 bg-sidebar-accent px-1.5 py-0.5 rounded">
          Admin
        </span>
      </div>
    </div>
  )
}

export function AdminSidebarNav() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === "/z_admin_minhaagendaai") {
      return pathname === href
    }
    return pathname?.startsWith(href)
  }

  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
      {menuGroups.map((group, groupIndex) => (
        <div key={groupIndex} className="mb-5">
          <h4 className="text-[10px] uppercase tracking-wider font-bold text-sidebar-foreground/40 mb-2 px-3">
            {group.title}
          </h4>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
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
      ))}
    </nav>
  )
}

export function AdminSidebar() {
  return (
    <aside className="hidden md:flex md:w-[220px] h-full bg-sidebar border-r border-sidebar-border flex-col relative z-10 transition-colors">
      <div className="flex flex-col h-full">
        <AdminBrand />
        <div className="flex-1 flex flex-col overflow-hidden">
          <AdminSidebarNav />
        </div>
      </div>
    </aside>
  )
}

export function AdminMobileSidebar() {
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
          <AdminBrand />
          <div className="flex-1 flex flex-col overflow-hidden">
            <AdminSidebarNav />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
