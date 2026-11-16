"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"

/**
 * Seletor de mês do resumo financeiro. O mês vive na URL (`?month=2026-11`): dá
 * para voltar, recarregar e mandar o link.
 */
export function MonthPicker({ month }: { month: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="finance-month" className="text-xs font-semibold text-muted-foreground">
        Mês
      </label>
      <input
        id="finance-month"
        type="month"
        value={month}
        disabled={isPending}
        onChange={(event) => {
          const next = event.target.value
          // Campo limpo não navega: o servidor cairia no mês corrente e o campo
          // voltaria preenchido, sem o usuário entender por quê.
          if (!next) return
          startTransition(() => router.push(`${pathname}?month=${next}`))
        }}
        className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all disabled:opacity-60"
      />
    </div>
  )
}
