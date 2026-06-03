"use client"

import { createBrowserClient } from "@supabase/ssr"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Sun, Moon } from "lucide-react"
import { useTheme } from "next-themes"

// Espelha o UserNav do sistema principal (toggle de tema + menu do usuário),
// sem o contexto de salão (créditos, notificações, configurações).
export function AdminUserNav({ userName }: { userName: string }) {
  const { setTheme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

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

    window.location.href = "/z_admin_login"
  }

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  // resolvedTheme é undefined até montar no cliente — evita mismatch de hidratação
  if (!resolvedTheme) {
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

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors">
            <div className="w-6 h-6 rounded-full bg-sidebar-accent flex items-center justify-center text-[10px] font-bold text-sidebar-foreground">
              {userName ? userName.charAt(0).toUpperCase() : "A"}
            </div>
            <span className="text-sm font-light text-sidebar-foreground/90 max-w-[120px] truncate hidden sm:inline">
              {userName || "Admin"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border">
          <DropdownMenuLabel>Administrador</DropdownMenuLabel>
          <DropdownMenuSeparator />
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
