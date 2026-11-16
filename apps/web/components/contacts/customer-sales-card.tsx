"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { listCustomerSales } from "@/app/actions/sales"
import { useSalon } from "@/contexts/salon-context"
import { SALE_STATUS_BADGE, SALE_STATUS_LABELS } from "@/lib/constants/sales.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import { formatBrazilTime } from "@/lib/utils/timezone.utils"
import { centsToNumeric } from "@repo/db/src/domain/sales"

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/**
 * Vendas na ficha do cliente (docs/ROADMAP.md, fases 1 e 2): as comandas dele, com
 * o que foi vendido e por quem — e quanto ele deve, quando há valor em aberto.
 *
 * Não renderiza NADA no salão sem o módulo de comandas ou para quem não tem acesso
 * a elas — a ficha continua igual à de antes. Com acesso, a action aplica as mesmas
 * regras de visibilidade da lista de comandas.
 */
export function CustomerSalesCard({ salonId, customerId }: { salonId: string; customerId: string }) {
  const { activeSalon } = useSalon()
  const enabled =
    !!activeSalon &&
    activeSalon.id === salonId &&
    activeSalon.modules.includes("sales") &&
    activeSalon.permissions.includes("sales.access")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-sales", salonId, customerId],
    queryFn: async () => {
      const res = await listCustomerSales(salonId, customerId)
      if ("error" in res) throw new Error(res.error)
      return res
    },
    enabled,
  })

  if (!enabled) return null

  const debt = data?.debt ?? null
  const today = data?.today ?? ""

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">Vendas</h3>

      {/* Débito: o total devido soma todas as comandas do cliente, não só as 50
          listadas abaixo. */}
      {debt && debt.openCents > 0 && (
        <div
          role="status"
          className={`mb-3 rounded-md border p-3 text-sm ${
            debt.overdueCents > 0
              ? "bg-destructive/10 border-destructive/20 text-destructive"
              : "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
          }`}
        >
          <span className="font-bold">Deve {formatBRL(centsToNumeric(debt.openCents))}</span>
          {" em "}
          {debt.count === 1 ? "1 comanda" : `${debt.count} comandas`}
          {debt.overdueCents > 0 ? ` · ${formatBRL(centsToNumeric(debt.overdueCents))} vencido` : ""}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground py-2">Não foi possível carregar as vendas.</p>
      ) : !data || data.sales.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nenhuma comanda registrada.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.sales.map((sale) => {
            const hasDebt = Number(sale.amountDue) > 0
            const overdue = hasDebt && !!sale.debtDueDate && sale.debtDueDate < today

            return (
              <div key={sale.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    <Link
                      href={`/${salonId}/sales/${sale.id}`}
                      className="font-mono font-semibold text-accent hover:underline"
                    >
                      #{sale.number}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {formatBrazilTime(new Date(sale.saleDate), "dd/MM/yyyy")}
                    </span>
                  </p>
                  {sale.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem itens</p>
                  ) : (
                    <ul className="mt-0.5 space-y-0.5">
                      {sale.items.map((item, index) => (
                        <li key={index} className="text-xs text-muted-foreground truncate">
                          {item.description}
                          {item.professionalName ? ` · ${item.professionalName}` : ""} · {formatBRL(item.total)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {hasDebt && (
                    <p
                      className={`mt-1 text-xs font-semibold ${
                        overdue ? "text-destructive" : "text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      Em aberto {formatBRL(sale.amountDue)}
                      {sale.debtDueDate
                        ? ` · ${overdue ? "venceu" : "vence"} em ${formatDate(sale.debtDueDate)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-foreground tabular-nums">{formatBRL(sale.total)}</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold ${SALE_STATUS_BADGE[sale.status]}`}
                  >
                    {SALE_STATUS_LABELS[sale.status]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
