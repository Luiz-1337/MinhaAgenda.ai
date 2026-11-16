"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Receipt, Search, X } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { endOfDayBrazil, formatBrazilTime, startOfDayBrazil } from "@/lib/utils/timezone.utils"
import { appointmentStatusLabel } from "@/lib/utils/appointment-status"
import type { DailyAppointment } from "@/lib/types/appointments"

interface GroupAppointmentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  /** O dia em foco na agenda. */
  date: Date
  /** Agendamentos carregados pela agenda (qualquer intervalo que contenha o dia). */
  appointments: DailyAppointment[]
}

/**
 * "Agrupar em comanda" (docs/ROADMAP.md, fase 1): os agendamentos do dia, por
 * cliente, para virar UMA comanda — a cliente que fez corte, unha e sobrancelha com
 * três profissionais paga de uma vez.
 *
 * Este diálogo só escolhe. Quem monta a comanda é a página
 * /sales/new?appointment=…, que confere no servidor se os agendamentos são do
 * salão, do mesmo cliente e se já não estão em outra comanda.
 */
export function GroupAppointmentsDialog({
  open,
  onOpenChange,
  salonId,
  date,
  appointments,
}: GroupAppointmentsDialogProps) {
  const router = useRouter()
  const [term, setTerm] = useState("")
  // Guarda o que foi DESMARCADO: o padrão é levar todos os agendamentos da pessoa.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const dayStart = startOfDayBrazil(date).getTime()
    const dayEnd = endOfDayBrazil(date).getTime()
    const byCustomer = new Map<string, { clientId: string; clientName: string; items: DailyAppointment[] }>()

    for (const appointment of appointments) {
      const start = new Date(appointment.startTime).getTime()
      if (start < dayStart || start > dayEnd) continue
      // Cancelado e falta não viram venda.
      if (appointment.status === "cancelled" || appointment.status === "no_show") continue

      const group = byCustomer.get(appointment.clientId) ?? {
        clientId: appointment.clientId,
        clientName: appointment.clientName || "Cliente",
        items: [],
      }
      group.items.push(appointment)
      byCustomer.set(appointment.clientId, group)
    }

    return Array.from(byCustomer.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"))
  }, [appointments, date])

  const cleaned = term.trim().toLocaleLowerCase("pt-BR")
  const visible = cleaned
    ? groups.filter((group) => group.clientName.toLocaleLowerCase("pt-BR").includes(cleaned))
    : groups

  function toggle(appointmentId: string, checked: boolean) {
    setExcluded((current) => {
      const next = new Set(current)
      if (checked) next.delete(appointmentId)
      else next.add(appointmentId)
      return next
    })
  }

  function createSale(ids: string[]) {
    const params = new URLSearchParams()
    for (const id of ids) params.append("appointment", id)
    onOpenChange(false)
    router.push(`/${salonId}/sales/new?${params.toString()}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Agrupar agendamentos em comanda</DialogTitle>

        <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Agrupar em comanda</h2>
            <p className="text-xs text-muted-foreground">
              Agendamentos de {formatBrazilTime(date, "dd/MM/yyyy")}, por cliente
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
            <input
              type="text"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar cliente"
              aria-label="Buscar cliente pelo nome"
              className="w-full bg-muted border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {groups.length === 0 ? "Nenhum agendamento neste dia." : "Nenhum cliente encontrado."}
            </p>
          ) : (
            visible.map((group) => {
              const selected = group.items.filter((item) => !excluded.has(item.id)).map((item) => item.id)

              return (
                <section key={group.clientId} className="border border-border rounded-md">
                  <div className="p-3 flex items-center justify-between gap-3 bg-muted/30">
                    <p className="text-sm font-bold text-foreground truncate">{group.clientName}</p>
                    <button
                      type="button"
                      onClick={() => createSale(selected)}
                      disabled={selected.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <Receipt size={14} />
                      Criar comanda{selected.length > 1 ? ` (${selected.length})` : ""}
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {group.items.map((item) => (
                      <label key={item.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors">
                        <Checkbox
                          checked={!excluded.has(item.id)}
                          onChange={(event) => toggle(item.id, event.target.checked)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-foreground truncate">
                            {item.serviceName}
                            <span className="text-muted-foreground"> · {item.professionalName}</span>
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatBrazilTime(item.startTime, "HH:mm")} · {appointmentStatusLabel(item.status)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
