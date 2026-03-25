"use client"

import { useState } from "react"
import { CreditCard, Plus, Loader2, Star } from "lucide-react"
import { toast } from "sonner"
import { createPortalSession } from "@/app/actions/stripe"

interface PaymentMethod {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

interface PaymentMethodsProps {
  salonId: string
  paymentMethods: PaymentMethod[]
}

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  elo: "Elo",
  hipercard: "Hipercard",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners",
  unionpay: "UnionPay",
  card: "Cartão",
}

const BRAND_COLORS: Record<string, string> = {
  visa: "text-blue-400",
  mastercard: "text-orange-400",
  amex: "text-cyan-400",
  elo: "text-yellow-400",
  hipercard: "text-red-400",
  discover: "text-orange-300",
  card: "text-slate-400",
}

export function PaymentMethods({ salonId, paymentMethods }: PaymentMethodsProps) {
  const [loading, setLoading] = useState(false)

  async function handleManageCards() {
    setLoading(true)
    try {
      const { url } = await createPortalSession(salonId)
      if (url) window.location.href = url
    } catch {
      toast.error("Erro ao abrir portal de pagamento")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <CreditCard size={18} className="text-indigo-500" />
          Métodos de Pagamento
        </h3>
        <button
          onClick={handleManageCards}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Plus size={12} />
          )}
          Gerenciar cartões
        </button>
      </div>

      {paymentMethods.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="p-3 rounded-full bg-slate-100 dark:bg-slate-800">
            <CreditCard size={22} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum cartão salvo
          </p>
          <button
            onClick={handleManageCards}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Adicionar cartão
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {paymentMethods.map((pm) => (
            <li
              key={pm.id}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-white/5"
            >
              <div className="flex items-center gap-3">
                <div className={`text-xs font-bold uppercase tracking-wider w-14 ${BRAND_COLORS[pm.brand] ?? BRAND_COLORS.card}`}>
                  {BRAND_LABELS[pm.brand] ?? pm.brand}
                </div>
                <div>
                  <p className="text-sm font-mono text-slate-700 dark:text-slate-200 tracking-widest">
                    •••• {pm.last4}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Válido até {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
                  </p>
                </div>
              </div>
              {pm.isDefault && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">
                  <Star size={9} fill="currentColor" />
                  Padrão
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
