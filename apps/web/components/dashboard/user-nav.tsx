"use client"

import { createBrowserClient } from "@supabase/ssr"
import { useState, useEffect } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { CreditsBadge } from "@/components/dashboard/credits-badge"
import { LogOut, Search, Bell, Sun, Moon, Settings } from "lucide-react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"

export function UserNav() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const { activeSalon } = useSalon()
  const { isManager } = useSalonAuth()
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [userName, setUserName] = useState<string>("")

  useEffect(() => {
    setMounted(true)
    setIsDark(resolvedTheme === 'dark' || (resolvedTheme === 'system' && theme === 'dark'))
  }, [theme, resolvedTheme])

  useEffect(() => {
    async function fetchUser() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name)
      } else if (user?.email) {
        setUserName(user.email.split("@")[0])
      }
    }
    fetchUser()
  }, [])

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
    setIsDark(!isDark)
  }

  if (!mounted) {
    return (
      <div className="flex items-center gap-4">
        <button className="p-2 rounded-full bg-slate-200/50 dark:bg-white/5 text-slate-600 dark:text-slate-400">
          <Sun size={18} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-full bg-slate-200/50 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-300/50 dark:hover:text-white transition-colors"
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDark ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {/* Credits Badge */}
      <CreditsBadge />

      {/* Search */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search size={16} className="text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Buscar..."
          className="pl-10 pr-4 py-1.5 bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-full text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:bg-white dark:focus:bg-slate-900 transition-all w-64 placeholder-slate-400 shadow-sm dark:shadow-none"
        />
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
        <Bell size={20} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full border-2 border-slate-50 dark:border-slate-900"></span>
      </button>

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-white/10">
              {userName ? userName.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                {userName || "Usuário"}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isManager ? 'Administrador' : 'Colaborador'}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
          <DropdownMenuLabel className="text-slate-700 dark:text-slate-200">Minha Conta</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-200 dark:bg-white/10" />
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/${activeSalon?.id}/settings`}>
              <Settings className="size-4 mr-2" />
              Configurações
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400 cursor-pointer"
          >
            <LogOut className="size-4 mr-2" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

