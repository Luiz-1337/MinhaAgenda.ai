"use client"

import { createBrowserClient } from "@supabase/ssr"
import { useIsMounted } from "@/lib/hooks/use-is-mounted"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CreditsBadge } from "@/components/dashboard/credits-badge"
import { LogOut, Sun, Moon, Settings } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"

export function UserNav({ userName }: { userName: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { activeSalon } = useSalon()
  const { isManager } = useSalonAuth()
  const mounted = useIsMounted()

  const isDark = mounted && (resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error("Erro ao fazer logout:", error)
      return
    }

    window.location.href = "/login"
  }

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    setTheme(newTheme)
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-3">
        <button className="p-1.5 rounded-md bg-sidebar-accent text-sidebar-foreground/60">
          <Sun size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="p-1.5 rounded-md bg-sidebar-accent text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground transition-colors"
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {/* Credits Badge */}
      <CreditsBadge />

      {/* Notificações: o sino funcional vive no header (AlertsBell). */}

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors">
            <div className="w-6 h-6 rounded-full bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-sidebar-foreground">
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </div>
            <span className="text-sm font-light text-sidebar-foreground/90 max-w-[100px] truncate hidden sm:inline">
              {userName || "Usuário"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border">
          <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="cursor-pointer focus:bg-sidebar-accent focus:text-sidebar-accent-foreground">
            <Link href={`/${activeSalon?.id}/settings`}>
              <Settings className="size-4 mr-2" />
              Configurações
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive focus:text-destructive focus:bg-sidebar-accent cursor-pointer"
          >
            <LogOut className="size-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
