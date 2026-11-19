"use client"

import { useState } from "react"
import { ExternalLink, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { createPortalSession, createCheckoutSession } from "@/app/actions/stripe"
import { formatPlanPrice, getPlan } from "@/lib/plans"

interface SubscriptionActionsProps {
  salonId: string
  hasSubscription: boolean
  tier: string
}

/** Planos que se assinam pelo Checkout. O ENTERPRISE é por contato. */
const SELF_SERVE_TIERS = ["SOLO", "PRO"] as const
type SelfServeTier = (typeof SELF_SERVE_TIERS)[number]

export function SubscriptionActions({ salonId, hasSubscription, tier }: SubscriptionActionsProps) {
  const [loading, setLoading] = useState<SelfServeTier | "portal" | null>(null)

  async function handleManageSubscription() {
    setLoading("portal")
    try {
      const { url } = await createPortalSession(salonId)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao abrir portal de assinatura")
    } finally {
      setLoading(null)
    }
  }

  async function handleSubscribe(selectedTier: SelfServeTier) {
    setLoading(selectedTier)
    try {
      const { url } = await createCheckoutSession(salonId, selectedTier)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao criar sessão de pagamento")
    } finally {
      setLoading(null)
    }
  }

  if (hasSubscription) {
    return (
      <button
        onClick={handleManageSubscription}
        disabled={loading !== null}
        className="px-5 py-2.5 bg-accent-foreground text-accent rounded-md text-sm font-bold hover:bg-accent-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {loading === "portal" ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        Gerenciar Assinatura
      </button>
    )
  }

  // Sem assinatura paga: qualquer plano pode ser assinado, inclusive o que já
  // aparece como "atual" (o tier pode ter vindo do cadastro ou do teste, sem
  // pagamento). O plano atual vem primeiro.
  const currentTier: string = tier
  const ordered = [...SELF_SERVE_TIERS].sort((a, b) =>
    a === currentTier ? -1 : b === currentTier ? 1 : 0,
  )

  return (
    <div className="flex gap-2 flex-wrap">
      {ordered.map((planTier) => (
        <button
          key={planTier}
          onClick={() => handleSubscribe(planTier)}
          disabled={loading !== null}
          className={
            planTier === currentTier
              ? "px-4 py-2 bg-accent-foreground text-accent rounded-md text-sm font-bold hover:bg-accent-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              : "px-4 py-2 bg-accent-foreground/20 text-accent-foreground border border-accent-foreground/30 rounded-md text-sm font-bold hover:bg-accent-foreground/30 transition-colors flex items-center gap-2 disabled:opacity-50"
          }
        >
          {loading === planTier ? <Loader2 size={14} className="animate-spin" /> : null}
          Assinar {getPlan(planTier).name} - {formatPlanPrice(planTier)}/mês
        </button>
      ))}
      <Link href="/contact?reason=enterprise_plan">
        <button
          className="px-4 py-2 bg-accent-foreground/20 text-accent-foreground border border-accent-foreground/30 rounded-md text-sm font-bold hover:bg-accent-foreground/30 transition-colors flex items-center gap-2"
        >
          Enterprise
          <ArrowRight size={14} />
        </button>
      </Link>
    </div>
  )
}
