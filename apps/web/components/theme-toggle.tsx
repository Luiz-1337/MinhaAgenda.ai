"use client"

import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const mode = (theme ?? resolvedTheme ?? "dark") as "light" | "dark"
  const isDark = mode === "dark"

  const label = isDark ? "Ativar modo claro" : "Ativar modo escuro"

  const handleToggle = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      aria-pressed={isDark}
      onClick={handleToggle}
      className="border-border bg-card text-foreground shadow-sm hover:border-primary/60 hover:text-primary"
    >
      <Sun className={cn("size-4", isDark ? "hidden" : "")} />
      <Moon className={cn("size-4", isDark ? "" : "hidden")} />
      {!mounted && <span className="sr-only">Alternar tema</span>}
    </Button>
  )
}

