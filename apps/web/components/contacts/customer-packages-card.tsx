"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { getCustomerPackages } from "@/app/actions/packages"
import { useSalon } from "@/contexts/salon-context"
import { PACKAGE_STATUS_CLASSES, PACKAGE_STATUS_LABELS } from "@/lib/constants/packages.constants"
import { formatBRL } from "@/lib/utils/money.utils"

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/**
 * Pacotes na ficha do cliente (docs/ROADMAP.md, fase 5, fatia 5b): o que ele
 * comprou, quanto resta de cada item, até quando vale e em quais comandas usou —
 * "Pacote, Qtde, Saldo, Disponibilidade, Comandas" na Belasis.
 *
 * Não renderiza NADA no salão sem o módulo de pacotes ou para quem não tem acesso a
 * eles — a ficha continua igual à de antes.
 */
export function CustomerPackagesCard({ salonId, customerId }: { salonId: string; customerId: string }) {
  const { activeSalon } = useSalon()
  const enabled =
    !!activeSalon &&
    activeSalon.id === salonId &&
    activeSalon.modules.includes("packages") &&
    activeSalon.permissions.includes("packages.access")

  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-packages", salonId, customerId],
    queryFn: async () => {
      const res = await getCustomerPackages(salonId, customerId)
      if ("error" in res) throw new Error(res.error)
      return res
    },
    enabled,
  })

  if (!enabled) return null

  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">Pacotes</h3>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground py-2">Não foi possível carregar os pacotes.</p>
      ) : !data || data.packages.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Nenhum pacote comprado.</p>
      ) : (
        <div className="divide-y divide-border">
          {data.packages.map((pkg) => (
            <div key={pkg.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{pkg.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(pkg.soldOn)} ·{" "}
                  <Link href={`/${salonId}/sales/${pkg.saleId}`} className="text-accent hover:underline">
                    Comanda #{pkg.saleNumber}
                  </Link>{" "}
                  · {formatBRL(pkg.price)} · {pkg.expiresOn ? `vale até ${formatDate(pkg.expiresOn)}` : "não vence"}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {pkg.items.map((item, index) => (
                    <li key={index} className="text-xs text-muted-foreground">
                      {item.description}: saldo {item.remaining} de {item.quantity}
                    </li>
                  ))}
                </ul>
                {pkg.uses.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Usado em{" "}
                    {pkg.uses.map((use, index) => (
                      <span key={use.saleId}>
                        {index > 0 && ", "}
                        <Link href={`/${salonId}/sales/${use.saleId}`} className="font-mono text-accent hover:underline">
                          #{use.number}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <span
                className={`flex-shrink-0 px-2 py-0.5 rounded text-[11px] font-semibold ${PACKAGE_STATUS_CLASSES[pkg.status]}`}
              >
                {PACKAGE_STATUS_LABELS[pkg.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
