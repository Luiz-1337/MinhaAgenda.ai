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
    <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <Zap size={18} className="text-indigo-500" />
          Comprar Créditos Extras
        </h3>
        {extraCredits > 0 && (
          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/20">
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
                ? 'border-indigo-400 dark:border-indigo-500/50 bg-indigo-50/50 dark:bg-indigo-500/5'
                : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            {pack.highlight && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-full tracking-wider whitespace-nowrap">
                Mais popular
              </span>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                {pack.label}
              </p>
              <p className="text-xl font-bold text-slate-800 dark:text-white flex items-baseline gap-1">
                {formatCredits(pack.credits)}
                <span className="text-xs font-normal text-slate-400">créditos</span>
              </p>
            </div>

            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              R$ {pack.price}
              <span className="text-xs font-normal text-slate-400 ml-1">único</span>
            </p>

            <button
              onClick={() => handleBuy(pack.id)}
              disabled={loading !== null}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                pack.highlight
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200'
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

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
        Créditos extras se acumulam ao seu saldo mensal e não expiram.
      </p>
    </div>
  )
}
