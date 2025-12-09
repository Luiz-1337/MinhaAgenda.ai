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
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground",
              "ring-1 ring-transparent hover:ring-border/70",
              active &&
                "bg-primary/15 text-foreground shadow-md ring-1 ring-primary/60"
            )}
          >
            <span
              className={cn(
                "absolute inset-y-1 left-1 w-[3px] rounded-full bg-transparent transition",
                active
                  ? "bg-gradient-to-b from-primary via-secondary to-primary"
                  : "group-hover:bg-foreground/20"
              )}
            />
            <Icon className={cn("size-4 text-muted-foreground transition", active && "text-primary")} />
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
        <Button
          variant="outline"
          size="icon"
          aria-label="Abrir menu"
          className="border-border bg-card text-foreground hover:border-primary/60 hover:text-primary"
        >
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
