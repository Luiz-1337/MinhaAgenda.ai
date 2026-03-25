"use client"

import { useState } from "react"
import { AlertTriangle, CreditCard, Loader2, RefreshCw, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { useParams } from "next/navigation"
import { createCheckoutSession, createPortalSession } from "@/app/actions/stripe"

export default function ExpiredPage() {
  const params = useParams()
  const salonId = params.salonId as string
  const [loading, setLoading] = useState<string | null>(null)

  async function handleReactivate(tier: 'SOLO' | 'PRO') {
    setLoading(tier)
    try {
      const { url } = await createCheckoutSession(salonId, tier)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao criar sessao de pagamento")
    } finally {
      setLoading(null)
    }
  }

  async function handleUpdatePayment() {
    setLoading('portal')
    try {
      const { url } = await createPortalSession(salonId)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao abrir portal de pagamento")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-lg w-full">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle size={48} className="text-amber-500" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-slate-800 dark:text-white mb-2">
          Sua assinatura expirou
        </h1>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-8">
          Para continuar usando o MinhaAgenda.AI, escolha um plano abaixo ou atualize seu metodo de pagamento.
        </p>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Solo */}
          <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md p-5 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Solo</h3>
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
              R$ 299<span className="text-sm font-normal text-slate-500">/mes</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 flex-1">
              <li>1 Salao</li>
              <li>1 Agente IA</li>
              <li>WhatsApp automatizado</li>
            </ul>
            <button
              onClick={() => handleReactivate('SOLO')}
              disabled={loading !== null}
              className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading === 'SOLO' ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              Assinar Solo
            </button>
          </div>

          {/* Pro */}
          <div className="rounded-xl border-2 border-violet-500/30 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md p-5 flex flex-col relative">
            <span className="absolute -top-2.5 left-4 px-2 py-0.5 bg-violet-600 text-white text-[10px] font-bold uppercase rounded-full tracking-wider">
              Popular
            </span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Pro</h3>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400 mt-1">
              R$ 999<span className="text-sm font-normal text-slate-500">/mes</span>
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400 flex-1">
              <li>Ate 3 Saloes</li>
              <li>3 Agentes IA</li>
              <li>Integracoes avancadas</li>
              <li>Suporte prioritario</li>
            </ul>
            <button
              onClick={() => handleReactivate('PRO')}
              disabled={loading !== null}
              className="mt-4 w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading === 'PRO' ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
              Assinar Pro
            </button>
          </div>
        </div>

        {/* Secondary Actions */}
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={handleUpdatePayment}
            disabled={loading !== null}
            className="text-sm text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={14} />
            Atualizar metodo de pagamento
          </button>

          <a
            href={`https://wa.me/${process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? ''}?text=Quero%20saber%20mais%20sobre%20o%20plano%20Enterprise`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 font-medium flex items-center gap-1.5"
          >
            <MessageCircle size={14} />
            Plano Enterprise? Fale conosco
          </a>
        </div>
      </div>
    </div>
  )
}
