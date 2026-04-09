"use client"

import { useState } from "react"
import { ExternalLink, Loader2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { createPortalSession, createCheckoutSession } from "@/app/actions/stripe"

interface SubscriptionActionsProps {
  salonId: string
  hasSubscription: boolean
  tier: string
}

const PLAN_ORDER: Record<string, number> = { SOLO: 1, PRO: 2, ENTERPRISE: 3 }

export function SubscriptionActions({ salonId, hasSubscription, tier }: SubscriptionActionsProps) {
  const [loading, setLoading] = useState(false)

  async function handleManageSubscription() {
    setLoading(true)
    try {
      const { url } = await createPortalSession(salonId)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao abrir portal de assinatura")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubscribe(selectedTier: 'SOLO' | 'PRO') {
    setLoading(true)
    try {
      const { url } = await createCheckoutSession(salonId, selectedTier)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao criar sessão de pagamento")
    } finally {
      setLoading(false)
    }
  }

  if (hasSubscription) {
    return (
      <button
        onClick={handleManageSubscription}
        disabled={loading}
        className="px-5 py-2.5 bg-accent-foreground text-accent rounded-md text-sm font-bold hover:bg-accent-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
        Gerenciar Assinatura
      </button>
    )
  }

  const currentOrder = PLAN_ORDER[tier] ?? 0
  const showPro = currentOrder < PLAN_ORDER.PRO
  const showEnterprise = currentOrder < PLAN_ORDER.ENTERPRISE

  if (!showPro && !showEnterprise) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {showPro && (
        <button
          onClick={() => handleSubscribe('PRO')}
          disabled={loading}
          className="px-4 py-2 bg-accent-foreground text-accent rounded-md text-sm font-bold hover:bg-accent-foreground/90 transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Assinar Pro - R$ 999/mês
        </button>
      )}
      {showEnterprise && (
        <Link href="/contact?reason=enterprise_plan">
          <button
            className="px-4 py-2 bg-accent-foreground/20 text-accent-foreground border border-accent-foreground/30 rounded-md text-sm font-bold hover:bg-accent-foreground/30 transition-colors flex items-center gap-2"
          >
            Enterprise
            <ArrowRight size={14} />
          </button>
        </Link>
      )}
    </div>
  )
}
