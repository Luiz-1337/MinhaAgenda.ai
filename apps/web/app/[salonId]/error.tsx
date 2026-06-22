"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

/**
 * Error boundary do painel autenticado. Captura exceções em RSCs/Server Actions
 * sob /[salonId] e no próprio layout, oferecendo recuperação sem recarregar a página.
 */
export default function SalonError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[salon-error-boundary]", error)
  }, [error])

  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-lg p-8 text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertTriangle size={24} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar esta tela. Pode ser uma falha temporária de
            conexão. Tente novamente.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <RotateCw size={16} />
          Tentar de novo
        </button>
        {error.digest && (
          <p className="text-[11px] text-muted-foreground/60 font-mono">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
