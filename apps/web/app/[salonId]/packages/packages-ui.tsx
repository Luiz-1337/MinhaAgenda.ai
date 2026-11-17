"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/** As telas de pacotes e de assinaturas, lado a lado (docs/ROADMAP.md, fase 5). */
const NAV_ITEMS = [
  { path: "", label: "Pacotes vendidos" },
  { path: "/templates", label: "Pacotes predefinidos" },
  { path: "/subscriptions", label: "Assinaturas" },
  { path: "/subscription-plans", label: "Planos de assinatura" },
  { path: "/reports", label: "Relatórios" },
] as const

export function PackagesNav({ salonId }: { salonId: string }) {
  const pathname = usePathname()
  const base = `/${salonId}/packages`

  return (
    <nav aria-label="Telas de pacotes e assinaturas" className="flex flex-wrap items-center gap-2 flex-shrink-0">
      {NAV_ITEMS.map((item) => {
        const href = `${base}${item.path}`
        const active = item.path === "" ? pathname === base : pathname.startsWith(href)
        return (
          <Link
            key={item.path}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              active
                ? "bg-foreground border-foreground text-background"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** "60" → "60 dias"; NULL → "Não vence". */
export function validityLabel(days: number | null): string {
  if (days === null) return "Não vence"
  return days === 1 ? "1 dia" : `${days} dias`
}
