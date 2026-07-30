"use client"

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import {
  Calendar, Clock, User, Scissors, X, FileText, Loader2,
  CheckCircle2, UserX, CalendarX, BadgeDollarSign,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  cancelAppointment,
  completeAppointment,
  markAppointmentNoShow,
} from "@/app/actions/appointments"
import { formatBrazilTime } from "@/lib/utils/timezone.utils"
import type { DailyAppointment } from "@/lib/types/appointments"
import { appointmentStatusLabel, availableOutcomes } from "@/lib/utils/appointment-status"
import { formatBRL, parseBRL, suggestedPriceFromService } from "@/lib/utils/money.utils"

/** Qual desfecho está em confirmação. `null` = nenhum (estado normal do rodapé). */
type PendingAction = null | "complete" | "no_show" | "cancel"

interface AppointmentDetailDialogProps {
  appointment: DailyAppointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  /** Chamado após QUALQUER desfecho registrado (o pai revalida a agenda). */
  onChanged: () => void
}

export function AppointmentDetailDialog({
  appointment,
  open,
  onOpenChange,
  salonId,
  onChanged,
}: AppointmentDetailDialogProps) {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [priceInput, setPriceInput] = useState("")
  const [isCourtesy, setIsCourtesy] = useState(false)
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()

  // Valor com que o campo abre, a partir do catálogo. É SUGESTÃO: "sob avaliação",
  // faixa sem mínimo e preço 0 abrem vazio — ~30% do catálogo cai nesses casos, e
  // abrir como R$ 0,00 faria o balcão concluir sem perceber que não informou valor.
  const suggestedPrice = useMemo(() => {
    if (!appointment) return null
    return suggestedPriceFromService({
      price: appointment.servicePrice,
      priceType: appointment.servicePriceType,
      priceMin: appointment.servicePriceMin,
      priceMax: appointment.servicePriceMax,
      priceOnRequest: appointment.servicePriceOnRequest,
    })
  }, [appointment])

  // Cada abertura começa limpa: um preço digitado e não confirmado não pode
  // reaparecer no agendamento seguinte.
  useEffect(() => {
    if (!open) {
      setPendingAction(null)
      setPriceInput("")
      setIsCourtesy(false)
      setReason("")
    }
  }, [open])

  if (!appointment) return null

  const dateLabel = formatBrazilTime(appointment.startTime, "dd/MM/yyyy")
  const timeLabel = `${formatBrazilTime(appointment.startTime, "HH:mm")} – ${formatBrazilTime(appointment.endTime, "HH:mm")}`

  // Mesma regra que o selo de pendências da agenda e o cron de fechamento usam.
  const { canComplete, canMarkNoShow, isSettled } = availableOutcomes(appointment)

  /** Texto de apoio do campo de preço, conforme o que o catálogo tem (ou não tem). */
  const priceHint = appointment.servicePriceOnRequest
    ? "Serviço sob avaliação — informe o valor combinado"
    : appointment.servicePriceType === "range"
      ? `Faixa do catálogo: ${formatBRL(appointment.servicePriceMin)} – ${formatBRL(appointment.servicePriceMax)}`
      : suggestedPrice === null
        ? "Sem preço no catálogo"
        : null

  function openComplete() {
    // Pré-preenche só ao ABRIR o formulário, para não sobrescrever o que o usuário
    // já digitou se ele fechar e reabrir.
    setPriceInput(suggestedPrice !== null ? String(suggestedPrice).replace(".", ",") : "")
    setIsCourtesy(false)
    setPendingAction("complete")
  }

  function run(label: string, fn: () => Promise<{ error: string } | unknown>) {
    startTransition(async () => {
      const res = await fn()
      if (res && typeof res === "object" && "error" in res) {
        toast.error((res as { error: string }).error)
        return
      }
      toast.success(label)
      onOpenChange(false)
      onChanged()
    })
  }

  function handleComplete() {
    const parsed = isCourtesy ? 0 : parseBRL(priceInput)
    if (parsed === null) {
      toast.error("Informe o valor cobrado, ou marque Cortesia.")
      return
    }
    run("Atendimento concluído", () =>
      completeAppointment(appointment!.id, salonId, parsed, isCourtesy)
    )
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
              {appointmentStatusLabel(appointment.status)}
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
          {/* Desfecho já registrado: mostra o fato, não oferece ação. */}
          {appointment.status === "completed" && (
            <DetailRow
              icon={<BadgeDollarSign size={15} />}
              label="Valor cobrado"
              value={formatBRL(appointment.priceCharged)}
            />
          )}
        </div>

        {/* Rodapé. Confirmação INLINE de propósito: modal aninhado dentro de Dialog
            briga por z-index, e o padrão inline já existia aqui. */}
        <div className="p-4 border-t border-border bg-muted/30">
          {isSettled ? (
            <p className="text-sm text-muted-foreground">
              {appointment.status === "completed" && appointment.completedAt
                ? `Concluído em ${formatBrazilTime(appointment.completedAt, "dd/MM/yyyy 'às' HH:mm")}.`
                : appointment.status === "no_show" && appointment.noShowAt
                  ? `Falta registrada em ${formatBrazilTime(appointment.noShowAt, "dd/MM/yyyy 'às' HH:mm")}.`
                  : appointment.status === "cancelled" && appointment.cancelledAt
                    ? `Cancelado em ${formatBrazilTime(appointment.cancelledAt, "dd/MM/yyyy 'às' HH:mm")}.`
                    : "Este agendamento já foi encerrado."}
            </p>
          ) : pendingAction === null ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {/* Concluir só depois de o atendimento COMEÇAR. Durante ele é
                    permitido: quem está no balcão sabe que acabou mais cedo. */}
                {canComplete && (
                  <button
                    type="button"
                    onClick={openComplete}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-600/90 text-white rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCircle2 size={16} />
                    Concluir
                  </button>
                )}
                {/* Falta só depois de o horário TERMINAR: antes disso o cliente
                    ainda pode chegar. */}
                {canMarkNoShow && (
                  <button
                    type="button"
                    onClick={() => setPendingAction("no_show")}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-2.5 bg-transparent border border-border hover:bg-muted text-foreground rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserX size={16} />
                    Não compareceu
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setReason(""); setPendingAction("cancel") }}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 text-destructive hover:bg-destructive/10 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CalendarX size={16} />
                Cancelar agendamento
              </button>
            </div>
          ) : pendingAction === "complete" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                  Valor cobrado
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={priceInput}
                  onChange={(e) => { setPriceInput(e.target.value); setIsCourtesy(false) }}
                  disabled={isPending || isCourtesy}
                  placeholder="0,00"
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
                />
              </label>
              {priceHint && <p className="text-xs text-muted-foreground">{priceHint}</p>}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={isCourtesy}
                  onChange={(e) => { setIsCourtesy(e.target.checked); if (e.target.checked) setPriceInput("") }}
                  disabled={isPending}
                  className="rounded border-border"
                />
                Cortesia (sem cobrança)
              </label>
              <ConfirmRow
                isPending={isPending}
                onBack={() => setPendingAction(null)}
                onConfirm={handleComplete}
                confirmLabel="Confirmar conclusão"
                pendingLabel="Concluindo..."
                icon={<CheckCircle2 size={16} />}
                tone="positive"
              />
            </div>
          ) : pendingAction === "no_show" ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground font-medium">
                Registrar que {appointment.clientName || "o cliente"} não compareceu?
              </p>
              <p className="text-xs text-muted-foreground">
                Isso entra no histórico do cliente e no cálculo de risco de falta.
              </p>
              <ConfirmRow
                isPending={isPending}
                onBack={() => setPendingAction(null)}
                onConfirm={() =>
                  run("Falta registrada", () => markAppointmentNoShow(appointment.id, salonId))
                }
                confirmLabel="Sim, não compareceu"
                pendingLabel="Registrando..."
                icon={<UserX size={16} />}
                tone="neutral"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-foreground font-medium">Cancelar este agendamento?</p>
              <p className="text-xs text-muted-foreground">
                O horário fica livre e o histórico é preservado.
              </p>
              <label className="block">
                <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                  Motivo (opcional)
                </span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  maxLength={500}
                  placeholder="Ex.: cliente pediu para desmarcar"
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
                />
              </label>
              <ConfirmRow
                isPending={isPending}
                onBack={() => setPendingAction(null)}
                onConfirm={() =>
                  run("Agendamento cancelado", () =>
                    cancelAppointment(appointment.id, salonId, reason)
                  )
                }
                confirmLabel="Sim, cancelar"
                pendingLabel="Cancelando..."
                icon={<CalendarX size={16} />}
                tone="destructive"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmRow({
  isPending,
  onBack,
  onConfirm,
  confirmLabel,
  pendingLabel,
  icon,
  tone,
}: {
  isPending: boolean
  onBack: () => void
  onConfirm: () => void
  confirmLabel: string
  pendingLabel: string
  icon: ReactNode
  tone: "positive" | "neutral" | "destructive"
}) {
  const toneClass =
    tone === "positive"
      ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
      : tone === "destructive"
        ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        : "bg-amber-600 hover:bg-amber-600/90 text-white"

  return (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={onBack}
        disabled={isPending}
        className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Voltar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={isPending}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : icon}
        {isPending ? pendingLabel : confirmLabel}
      </button>
    </div>
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
