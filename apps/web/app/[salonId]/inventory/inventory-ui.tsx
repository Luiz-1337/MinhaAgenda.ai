"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { X } from "lucide-react"

/**
 * Peças de tela que as páginas de estoque dividem (docs/ROADMAP.md, fase 4):
 * estoque, compras, fornecedores e marcas/categorias.
 */

export const controlClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all disabled:opacity-60"
export const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
export const labelClass = "text-xs font-semibold text-muted-foreground"
export const iconButtonClass =
  "p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"

// Formatar e ler quantidade mora em lib/utils/quantity.utils.ts (com teste); as telas
// do estoque continuam importando daqui.
export { formatQuantity, parseQuantity, quantityToInput } from "@/lib/utils/quantity.utils"

/** "2026-11-16" → "16/11/2026". Dia de calendário, sem fuso. */
export function formatCalendarDate(date: string): string {
  const [year, month, day] = date.split("-")
  return `${day}/${month}/${year}`
}

export function Modal({
  title,
  onClose,
  disabled,
  children,
}: {
  title: string
  onClose: () => void
  disabled: boolean
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={disabled ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-md overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            aria-label="Fechar"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

const NAV_ITEMS = [
  { path: "", label: "Produtos e saldo" },
  { path: "/purchases", label: "Compras" },
  { path: "/batches", label: "Lotes e validades" },
  { path: "/consumption", label: "Consumo por serviço" },
  { path: "/requests", label: "Solicitações" },
  { path: "/reports", label: "Relatórios" },
  { path: "/suppliers", label: "Fornecedores" },
  { path: "/catalog", label: "Marcas e categorias" },
] as const

/** As telas do estoque, lado a lado. */
export function InventoryNav({ salonId }: { salonId: string }) {
  const pathname = usePathname()
  const base = `/${salonId}/inventory`

  return (
    <nav aria-label="Telas do estoque" className="flex flex-wrap items-center gap-2 flex-shrink-0">
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
