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
  Calendar,
} from "lucide-react"
import { useSalon } from "@/contexts/salon-context"

const navItems = [
  { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "schedule", label: "Agenda", icon: Calendar },
  { href: "chat", label: "Conversas", icon: MessageSquare },
  { href: "agents", label: "Agentes", icon: Bot },
  { href: "contacts", label: "Contatos", icon: User },
  { href: "team", label: "Equipe", icon: Users },
  { href: "billing", label: "Faturamento", icon: CreditCard },
  { href: "services", label: "Serviços", icon: Scissors },
  { href: "settings", label: "Configurações", icon: Settings },
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
    if (!activeSalon) return `/${baseHref}`
    // Se for "dashboard", usa apenas o salonId, caso contrário adiciona a rota
    if (baseHref === "dashboard") {
      return `/${activeSalon.id}/dashboard`
    }
    return `/${activeSalon.id}/${baseHref}`
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
        // Verifica se a rota atual corresponde ao item do menu
        const active = pathname === hrefWithSalon || 
          (href !== "dashboard" && pathname?.startsWith(`/${activeSalon?.id}/${href}`)) ||
          (href === "dashboard" && pathname?.startsWith(`/${activeSalon?.id}/dashboard`))
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
