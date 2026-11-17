"use client"

import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"

const controlClass =
  "bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all disabled:opacity-60"

/**
 * Filtros do extrato de comissões. Vivem na URL (`?from=&to=&professional=`): dá
 * para voltar, recarregar e mandar o link.
 */
export function CommissionFilters({
  from,
  to,
  professionalId,
  professionals,
  showAllOption,
}: {
  from: string
  to: string
  professionalId: string | null
  professionals: { id: string; name: string }[]
  /** "Todos" só faz sentido para quem vê mais de um profissional. */
  showAllOption: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { from: string; to: string; professionalId: string | null }) {
    const params = new URLSearchParams({ from: next.from, to: next.to })
    if (next.professionalId) params.set("professional", next.professionalId)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
      <div className="flex flex-col gap-1">
        <label htmlFor="commissions-from" className="text-xs font-semibold text-muted-foreground">
          De
        </label>
        <input
          id="commissions-from"
          type="date"
          value={from}
          disabled={isPending}
          onChange={(event) => {
            // Campo limpo não navega: o servidor cairia no mês corrente e o campo
            // voltaria preenchido, sem o usuário entender por quê.
            if (event.target.value) navigate({ from: event.target.value, to, professionalId })
          }}
          className={controlClass}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="commissions-to" className="text-xs font-semibold text-muted-foreground">
          Até
        </label>
        <input
          id="commissions-to"
          type="date"
          value={to}
          disabled={isPending}
          onChange={(event) => {
            if (event.target.value) navigate({ from, to: event.target.value, professionalId })
          }}
          className={controlClass}
        />
      </div>
      {(showAllOption || professionals.length > 1) && (
        <div className="flex flex-col gap-1">
          <label htmlFor="commissions-professional" className="text-xs font-semibold text-muted-foreground">
            Profissional
          </label>
          <select
            id="commissions-professional"
            value={professionalId ?? ""}
            disabled={isPending}
            onChange={(event) => navigate({ from, to, professionalId: event.target.value || null })}
            className={controlClass}
          >
            <option value="">Todos</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
