import {
  CreditCard,
  Check,
  Zap,
  Shield,
  Sparkles,
  AlertTriangle,
} from "lucide-react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, salons, eq } from "@repo/db"
import { getSubscriptionDetails } from "@/app/actions/stripe"
import { getRemainingCredits } from "@/app/actions/credits"
import { SubscriptionActions } from "@/components/billing/subscription-actions"
import { InvoiceList } from "@/components/billing/invoice-list"
import { BuyCredits } from "@/components/billing/buy-credits"
import { PaymentMethods } from "@/components/billing/payment-methods"
import { CREDIT_PACKS } from "@/lib/stripe"

const PLAN_INFO: Record<string, { name: string; price: string; features: string[] }> = {
  SOLO: {
    name: "Plano Solo",
    price: "R$ 299",
    features: [
      "1 Salao",
      "1 Agente IA",
      "Atendimento WhatsApp automatizado",
      "Suporte por email",
    ],
  },
  PRO: {
    name: "Plano Pro",
    price: "R$ 999",
    features: [
      "Ate 3 Saloes",
      "3 Agentes IA",
      "Integracoes avancadas",
      "Suporte prioritario",
      "Relatorios avancados",
    ],
  },
  ENTERPRISE: {
    name: "Plano Enterprise",
    price: "Sob Consulta",
    features: [
      "Saloes ilimitados",
      "Agentes ilimitados",
      "API dedicada",
      "Gerente de conta",
    ],
  },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PAID: { label: "Ativa", color: "text-emerald-300" },
  ACTIVE: { label: "Ativa", color: "text-emerald-300" },
  TRIAL: { label: "Trial", color: "text-amber-300" },
  PAST_DUE: { label: "Pagamento Pendente", color: "text-amber-300" },
  CANCELED: { label: "Cancelada", color: "text-red-300" },
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Verificação server-side: apenas o dono do salão acessa o billing
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })
  if (!salon || salon.ownerId !== user.id) redirect(`/${salonId}/dashboard`)

  const [details, creditsResult] = await Promise.all([
    getSubscriptionDetails(salonId),
    getRemainingCredits(salonId).catch(() => ({ remaining: 0, total: 0, used: 0 })),
  ])
  const credits = 'error' in creditsResult
    ? { remaining: 0, total: 0, used: 0 }
    : creditsResult

  const plan = PLAN_INFO[details.tier] ?? PLAN_INFO.SOLO
  const statusInfo = STATUS_LABELS[details.subscriptionStatus] ?? STATUS_LABELS.TRIAL
  const hasSubscription = !!details.subscription
  const renewalDate = details.subscription?.currentPeriodEnd
    ? new Date(details.subscription.currentPeriodEnd * 1000).toLocaleDateString('pt-BR')
    : null

  return (
    <div className="flex flex-col h-full gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
          <CreditCard size={24} className="text-indigo-500" />
          Faturamento
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gerencie sua assinatura, metodos de pagamento e faturas.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">

          {/* Coluna Esquerda: Plano + Incluso */}
          <div className="flex flex-col gap-6">
            {/* Plan Card (Hero) */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 text-white shadow-xl shadow-indigo-500/20">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl -ml-10 -mb-10 pointer-events-none" />

              <div className="relative p-6 sm:p-8 flex flex-col gap-6">
                <div className="flex justify-between items-start flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-3 py-1 rounded-full backdrop-blur-md border border-white/20 text-xs font-bold uppercase tracking-wider ${
                        details.subscriptionStatus === 'PAST_DUE' ? 'bg-amber-500/30' :
                        details.subscriptionStatus === 'CANCELED' ? 'bg-red-500/30' :
                        'bg-white/20'
                      }`}>
                        {statusInfo.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-indigo-100 bg-indigo-800/30 px-2 py-1 rounded-md border border-white/10">
                        <Sparkles size={10} /> {details.tier}
                      </span>
                    </div>
                    <h3 className="text-3xl font-bold mb-1">{plan.name}</h3>
                    {renewalDate && (
                      <p className="text-indigo-100 text-sm opacity-90">
                        {details.subscription?.cancelAtPeriodEnd
                          ? <>Cancela em <span className="font-mono font-bold">{renewalDate}</span></>
                          : <>Renovacao automatica em <span className="font-mono font-bold">{renewalDate}</span></>
                        }
                      </p>
                    )}
                    {!hasSubscription && details.subscriptionStatus === 'TRIAL' && (
                      <p className="text-amber-200 text-sm flex items-center gap-1 mt-1">
                        <AlertTriangle size={14} />
                        Assine para continuar usando o sistema
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Valor mensal</p>
                    <p className="text-3xl font-bold">{plan.price}<span className="text-lg opacity-80">/mes</span></p>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/10 flex flex-wrap gap-6 items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Creditos Restantes</p>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold font-mono">
                          {credits.remaining >= 1_000_000
                            ? `${(credits.remaining / 1_000_000).toFixed(1)}M`
                            : credits.remaining >= 1_000
                            ? `${(credits.remaining / 1_000).toFixed(0)}K`
                            : credits.remaining}
                        </span>
                        <span className="text-xs opacity-70">/ {credits.total >= 1_000_000 ? `${(credits.total / 1_000_000).toFixed(0)}M` : credits.total}</span>
                      </div>
                    </div>
                    <div className="w-px h-8 bg-white/20" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wider opacity-70 mb-1">Status</p>
                      <div className={`flex items-center gap-2 ${statusInfo.color}`}>
                        <Shield size={16} />
                        <span className="text-sm font-bold">{statusInfo.label}</span>
                      </div>
                    </div>
                  </div>

                  <SubscriptionActions
                    salonId={salonId}
                    hasSubscription={hasSubscription}
                    tier={details.tier}
                  />
                </div>
              </div>
            </div>

            {/* Incluso no Plano */}
            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
              <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Zap size={18} className="text-amber-500" />
                Incluso no seu plano
              </h3>
              <ul className="space-y-3">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="mt-0.5 p-0.5 rounded-full bg-emerald-500/10 text-emerald-500 dark:text-emerald-400">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          {/* Comprar Créditos Extras */}
          <BuyCredits
            salonId={salonId}
            extraCredits={details.extraCredits ?? 0}
            packs={CREDIT_PACKS}
          />
          </div>

          {/* Coluna Direita: Métodos de Pagamento + Faturas */}
          <div className="flex flex-col gap-6">
            <PaymentMethods
              salonId={salonId}
              paymentMethods={details.paymentMethods}
            />
            <InvoiceList invoices={details.invoices} />
          </div>

        </div>
      </div>
    </div>
  )
}
