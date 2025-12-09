"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  LayoutDashboard,
  Users,
  Settings,
  Menu,
  MessageSquare,
  Bot,
  CreditCard,
  User,
  Scissors,
} from "lucide-react"

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/chat", label: "Conversas", icon: MessageSquare },
  { href: "/dashboard/agents", label: "Agentes", icon: Bot },
  { href: "/dashboard/contacts", label: "Contatos", icon: User },
  { href: "/dashboard/team", label: "Equipe", icon: Users },
  { href: "/dashboard/billing", label: "Faturamento", icon: CreditCard },
  { href: "/dashboard/services", label: "Serviços", icon: Scissors },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
] as const

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-1 flex-col gap-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 hover:text-white",
              "ring-1 ring-transparent hover:ring-white/10",
              active &&
                "bg-white/10 text-white shadow-[0_1px_20px_rgba(94,234,212,0.12)] ring-1 ring-cyan-400/40"
            )}
          >
            <span
              className={cn(
                "absolute inset-y-1 left-1 w-[3px] rounded-full bg-transparent transition",
                active ? "bg-gradient-to-b from-cyan-400 via-indigo-400 to-fuchsia-400" : "group-hover:bg-white/30"
              )}
            />
            <Icon className={cn("size-4 text-slate-400 transition", active && "text-cyan-300")} />
            <span className="text-sm font-medium">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileSidebar() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Abrir menu" className="border-white/20 bg-white/5 text-white hover:border-cyan-400/50 hover:text-cyan-100">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle className="text-primary font-semibold">MinhaAgenda AI</SheetTitle>
        </SheetHeader>
        <div className="px-4">
          <SidebarNav />
        </div>
      </SheetContent>
    </Sheet>
  )
}
