"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
  Plus,
} from "lucide-react"
import { useSalon } from "@/contexts/salon-context"

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
  const router = useRouter()
  const { activeSalon } = useSalon()

  const handleCreateSalon = () => {
    router.push("/onboarding")
  }

  // Função para construir href com salonId
  const buildHref = (baseHref: string) => {
    if (!activeSalon) return baseHref
    const separator = baseHref.includes("?") ? "&" : "?"
    return `${baseHref}${separator}salonId=${activeSalon.id}`
  }

  return (
    <nav className="space-y-1">
      <Button
        onClick={handleCreateSalon}
        className="w-full justify-start gap-2 mb-4 font-semibold"
        size="default"
      >
        <Plus className="size-4" />
        <span>Criar Novo Salão</span>
      </Button>
      {navItems.map(({ href, label, icon: Icon }) => {
        const hrefWithSalon = buildHref(href)
        const active = pathname === href || (href !== "/" && pathname.startsWith(href))
        return (
          <Link
            key={href}
            href={hrefWithSalon}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
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
        <Button variant="outline" size="icon" aria-label="Abrir menu">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b p-6">
          <SheetTitle>MinhaAgenda AI</SheetTitle>
          <p className="text-sm text-muted-foreground">Pilotando a operação com IA</p>
        </SheetHeader>
        <div className="p-4">
          <SidebarNav />
        </div>
      </SheetContent>
    </Sheet>
  )
}
