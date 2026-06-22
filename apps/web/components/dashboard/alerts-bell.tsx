"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, X } from "lucide-react"
import { getSalonAlerts, dismissAlert, type SalonAlert } from "@/app/actions/alerts"

/**
 * Sino de alertas operacionais do salão (sem créditos, resposta não entregue,
 * instância desconectada, etc.). Faz polling a cada 60s via react-query e
 * permite resolver.
 *
 * O painel é renderizado via portal em document.body para escapar do stacking
 * context do <header relative z-10>: se ficasse inline, o z-50 do dropdown
 * ficaria preso no nível z-10 do header e seria coberto por conteúdo da página.
 */
export function AlertsBell({ salonId }: { salonId: string }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const queryClient = useQueryClient()
  const queryKey = ["alerts", salonId] as const

  const { data: alerts = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getSalonAlerts(salonId)
      return "alerts" in res ? res.alerts : ([] as SalonAlert[])
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const updatePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
  }, [])

  // Reposiciona enquanto aberto (scroll/resize) e fecha em Escape.
  useEffect(() => {
    if (!open) return
    updatePosition()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [open, updatePosition])

  const handleDismiss = async (id: string) => {
    // Atualização otimista no cache do react-query.
    queryClient.setQueryData<SalonAlert[]>(queryKey, (prev) =>
      (prev ?? []).filter((a) => a.id !== id)
    )
    await dismissAlert(id)
    void queryClient.invalidateQueries({ queryKey })
  }

  const count = alerts.length

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md hover:bg-muted transition-colors"
        aria-label={`Alertas${count > 0 ? ` (${count})` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open &&
        coords &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[99]"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-label="Alertas do salão"
              className="fixed w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-[100]"
              style={{ top: coords.top, right: coords.right }}
            >
              <div className="px-3 py-2 border-b border-border text-sm font-medium">
                Alertas{count > 0 ? ` (${count})` : ""}
              </div>
              {count === 0 ? (
                <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                  Nenhum alerta aberto
                </div>
              ) : (
                alerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-0"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${
                        a.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{a.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(a.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDismiss(a.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      aria-label="Resolver alerta"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
