"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import { Calendar, Clock, User, Scissors, Trash2, X, FileText } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { deleteAppointment } from "@/app/actions/appointments"
import { formatBrazilTime } from "@/lib/utils/timezone.utils"
import type { DailyAppointment } from "@/lib/types/appointments"

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
}

interface AppointmentDetailDialogProps {
  appointment: DailyAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  /** Chamado após apagar com sucesso (o pai revalida a agenda). */
  onDeleted: () => void
}

export function AppointmentDetailDialog({
  appointment,
  open,
  onOpenChange,
  salonId,
  onDeleted,
}: AppointmentDetailDialogProps) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Garante que cada abertura começa fora do estado de confirmação.
  useEffect(() => {
    if (!open) setConfirming(false)
  }, [open])

  if (!appointment) return null

  const dateLabel = formatBrazilTime(appointment.startTime, "dd/MM/yyyy")
  const timeLabel = `${formatBrazilTime(appointment.startTime, "HH:mm")} – ${formatBrazilTime(appointment.endTime, "HH:mm")}`

  function handleDelete(apt: DailyAppointment) {
    startTransition(async () => {
      const res = await deleteAppointment(apt.id, salonId)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Agendamento apagado")
      onOpenChange(false)
      onDeleted()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">Detalhes do agendamento</DialogTitle>

        {/* Header */}
        <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground tracking-tight truncate">
              {appointment.clientName || "Cliente"}
            </h2>
            <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
              {STATUS_LABELS[appointment.status] ?? appointment.status}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3 text-sm">
          <DetailRow icon={<Scissors size={15} />} label="Serviço" value={appointment.serviceName} />
          <DetailRow icon={<User size={15} />} label="Profissional" value={appointment.professionalName} />
          <DetailRow icon={<Calendar size={15} />} label="Data" value={dateLabel} />
          <DetailRow icon={<Clock size={15} />} label="Horário" value={timeLabel} />
          {appointment.notes && (
            <DetailRow icon={<FileText size={15} />} label="Observações" value={appointment.notes} />
          )}
        </div>

        {/* Footer com confirmação inline (evita modal aninhado e problema de z-index) */}
        <div className="p-4 border-t border-border bg-muted/30">
          {!confirming ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={16} />
                Apagar agendamento
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground font-medium">
                Tem certeza? Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(appointment)}
                  disabled={isPending}
                  className="flex items-center gap-2 px-4 py-2.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} />
                  {isPending ? "Apagando..." : "Sim, apagar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
        <p className="text-foreground break-words">{value}</p>
      </div>
    </div>
  )
}
