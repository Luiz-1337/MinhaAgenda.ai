"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell, X } from "lucide-react"
import { getSalonAlerts, dismissAlert, type SalonAlert } from "@/app/actions/alerts"

/**
 * Sino de alertas operacionais do salão (sem créditos, resposta não entregue,
 * instância desconectada, etc.). Faz polling a cada 60s e permite resolver.
 */
export function AlertsBell({ salonId }: { salonId: string }) {
  const [alerts, setAlerts] = useState<SalonAlert[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    const res = await getSalonAlerts(salonId)
    if ("alerts" in res) setAlerts(res.alerts)
  }, [salonId])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 60000)
    return () => clearInterval(timer)
  }, [load])

  const handleDismiss = async (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    await dismissAlert(id)
    void load()
  }

  const count = alerts.length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md hover:bg-muted transition-colors"
        aria-label={`Alertas${count > 0 ? ` (${count})` : ""}`}
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg z-50">
            <div className="px-3 py-2 border-b border-border text-sm font-medium">
              Alertas{count > 0 ? ` (${count})` : ""}
            </div>
            {count === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">Nenhum alerta aberto</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2 px-3 py-2 border-b border-border last:border-0">
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
        </>
      )}
    </div>
  )
}
