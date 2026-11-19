import type { Metadata } from "next"
import { getPublicSubscriptionPlansService } from "@repo/db"
import { subscriptionIntervalLabel } from "@/lib/constants/subscriptions.constants"
import { formatBRL } from "@/lib/utils/money.utils"

/**
 * Página pública com os planos de assinatura do salão (docs/ROADMAP.md, fase 8,
 * fatia 8c).
 *
 * Página SEM login e só de leitura: mostra os planos ativos marcados como
 * visíveis. Não vende nem cobra — sem pagamento online, quem assina fala com o
 * salão. Só existe para salão com o módulo de pacotes e assinaturas; para os
 * outros (e para id desconhecido) a resposta é a mesma.
 */

export const metadata: Metadata = {
  title: "Planos de assinatura",
  robots: { index: false, follow: false },
}

// O salão liga e desliga planos a qualquer hora: nunca em cache.
export const dynamic = "force-dynamic"

export default async function PublicPlansPage({ params }: { params: Promise<{ salonId: string }> }) {
  const { salonId } = await params
  const data = await getPublicSubscriptionPlansService(salonId)

  return (
    <main className="min-h-screen bg-background flex items-start justify-center p-4 sm:py-10">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl p-6 space-y-5">
        {!data ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-bold text-foreground">Planos indisponíveis</h1>
            <p className="text-sm text-muted-foreground">
              Este endereço não existe ou o salão não mostra planos por aqui. Fale direto com o salão.
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Planos de assinatura
              </p>
              <h1 className="text-xl font-bold text-foreground">{data.salonName}</h1>
            </header>

            {data.plans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center">
                Ainda não há planos para mostrar por aqui. Fale direto com o salão.
              </p>
            ) : (
              <>
                <ul className="space-y-3">
                  {data.plans.map((plan) => (
                    <li key={plan.id} className="rounded-lg border border-border bg-background p-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-base font-bold text-foreground">{plan.name}</h2>
                        <p className="text-right">
                          <span className="text-lg font-bold tabular-nums text-foreground">{formatBRL(plan.price)}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {subscriptionIntervalLabel(plan.intervalMonths)}
                          </span>
                        </p>
                      </div>
                      {plan.description && (
                        <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{plan.description}</p>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    Para assinar, fale com o salão. O pagamento é combinado direto com ele.
                  </p>
                  {data.salonWhatsapp && (
                    <a
                      href={`https://wa.me/${data.salonWhatsapp}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors"
                    >
                      Falar com o salão no WhatsApp
                    </a>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
