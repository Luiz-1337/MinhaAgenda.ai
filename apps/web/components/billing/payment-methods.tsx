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
  card: "text-muted-foreground",
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
    <div className="bg-card rounded-md border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <CreditCard size={18} className="text-accent" />
          Métodos de Pagamento
        </h3>
        <button
          onClick={handleManageCards}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
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
          <div className="p-3 rounded-full bg-muted">
            <CreditCard size={22} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhum cartão salvo
          </p>
          <button
            onClick={handleManageCards}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-accent-foreground bg-accent hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
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
              className="flex items-center justify-between p-3 rounded-md bg-muted border border-border"
            >
              <div className="flex items-center gap-3">
                <div className={`text-xs font-bold uppercase tracking-wider w-14 ${BRAND_COLORS[pm.brand] ?? BRAND_COLORS.card}`}>
                  {BRAND_LABELS[pm.brand] ?? pm.brand}
                </div>
                <div>
                  <p className="text-sm font-mono text-foreground tracking-widest">
                    •••• {pm.last4}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Válido até {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
                  </p>
                </div>
              </div>
              {pm.isDefault && (
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-800">
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
