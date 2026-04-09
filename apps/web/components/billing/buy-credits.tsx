"use client"

import { useState } from "react"
import { Zap, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { createCreditPackCheckoutSession } from "@/app/actions/stripe"
import type { CreditPack } from "@/lib/stripe"

interface BuyCreditsProps {
  salonId: string
  extraCredits: number
  packs: CreditPack[]
}

function formatCredits(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function BuyCredits({ salonId, extraCredits, packs }: BuyCreditsProps) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleBuy(packId: string) {
    setLoading(packId)
    try {
      const { url } = await createCreditPackCheckoutSession(salonId, packId)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao iniciar compra de créditos")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-card rounded-md border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <Zap size={18} className="text-accent" />
          Comprar Créditos Extras
        </h3>
        {extraCredits > 0 && (
          <span className="text-xs font-medium text-accent bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
            {formatCredits(extraCredits)} extras disponíveis
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className={`relative rounded-xl border p-4 flex flex-col gap-3 transition-all ${
              pack.highlight
                ? 'border-accent bg-accent/10'
                : 'border-border hover:border-border/80'
            }`}
          >
            {pack.highlight && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-accent text-accent-foreground text-[10px] font-bold uppercase rounded-full tracking-wider whitespace-nowrap">
                Mais popular
              </span>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
                {pack.label}
              </p>
              <p className="text-xl font-bold text-foreground flex items-baseline gap-1">
                {formatCredits(pack.credits)}
                <span className="text-xs font-normal text-muted-foreground">créditos</span>
              </p>
            </div>

            <p className="text-lg font-bold text-accent">
              R$ {pack.price}
              <span className="text-xs font-normal text-muted-foreground ml-1">único</span>
            </p>

            <button
              onClick={() => handleBuy(pack.id)}
              disabled={loading !== null}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                pack.highlight
                  ? 'bg-accent hover:bg-accent/90 text-accent-foreground'
                  : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              {loading === pack.id
                ? <Loader2 size={14} className="animate-spin" />
                : <Sparkles size={14} />
              }
              Comprar
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Créditos extras se acumulam ao seu saldo mensal e não expiram.
      </p>
    </div>
  )
}
