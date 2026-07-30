/**
 * Fonte única de rótulo e cor por status de agendamento.
 *
 * Antes o rótulo vivia em `components/scheduler/appointment-detail-dialog.tsx` e a
 * cor em `components/scheduler/monthly-scheduler.tsx`, cada um com o seu mapa. Ao
 * adicionar `no_show` isso significaria lembrar de dois lugares (e a ficha do
 * cliente seria o terceiro) — e o fallback do diálogo é imprimir o valor cru, ou
 * seja, "no_show" apareceria na tela do dono.
 *
 * Sem dependências de propósito (nem React, nem @repo/db): serve RSC, client e o
 * grafo do worker, que roda via tsx e não resolve o alias `@/`.
 */

/** Os valores de `public.status` (pgEnum `statusEnum` no schema). */
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show"

export interface AppointmentStatusStyle {
  bg: string
  border: string
  text: string
}

const LABELS: Record<AppointmentStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu",
}

const STYLES: Record<AppointmentStatus, AppointmentStatusStyle> = {
  confirmed: { bg: "bg-accent/20 dark:bg-accent/40", border: "border-accent", text: "text-accent" },
  pending: { bg: "bg-rose-100 dark:bg-rose-500", border: "border-rose-400", text: "text-rose-600 dark:text-rose-300" },
  cancelled: { bg: "bg-red-100 dark:bg-red-600", border: "border-red-600", text: "text-red-700 dark:text-red-200" },
  completed: { bg: "bg-emerald-100 dark:bg-emerald-600", border: "border-emerald-600", text: "text-emerald-700 dark:text-emerald-200" },
  // Falta é um desfecho neutro-negativo, não um erro do sistema: âmbar, não vermelho
  // (vermelho já é cancelamento, e confundir os dois na grade apaga a diferença
  // entre "o cliente avisou" e "o cliente não apareceu").
  no_show: { bg: "bg-amber-100 dark:bg-amber-600", border: "border-amber-600", text: "text-amber-700 dark:text-amber-200" },
}

const FALLBACK_STYLE: AppointmentStatusStyle = {
  bg: "bg-blue-100 dark:bg-blue-600",
  border: "border-blue-600",
  text: "text-blue-700 dark:text-blue-200",
}

/**
 * Rótulo em pt-BR. Nunca devolve o valor cru do banco: um status novo aparece
 * como "—" em vez de vazar `no_show`/`in_progress` para a tela do dono.
 */
export function appointmentStatusLabel(status: string | null | undefined): string {
  if (!status) return "—"
  return LABELS[status as AppointmentStatus] ?? "—"
}

export function appointmentStatusStyle(status: string | null | undefined): AppointmentStatusStyle {
  if (!status) return FALLBACK_STYLE
  return STYLES[status as AppointmentStatus] ?? FALLBACK_STYLE
}

/** Desfechos terminais: não há mais o que fazer com o agendamento. */
export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === "completed" || status === "cancelled" || status === "no_show"
}

export interface AvailableOutcomes {
  /** Marcar como realizado (exige valor cobrado). */
  canComplete: boolean
  /** Registrar que o cliente não apareceu. */
  canMarkNoShow: boolean
  /** Cancelar (o horário fica livre; o histórico fica). */
  canCancel: boolean
  /** Já tem desfecho: a tela mostra o fato em vez de oferecer ação. */
  isSettled: boolean
}

/**
 * Que desfechos cabem num agendamento agora.
 *
 * Fonte única da regra porque ela aparece em três lugares: os botões do diálogo, o
 * selo "N atendimentos aguardando fechamento" na agenda e o cron de fechamento.
 * Divergirem entre si seria o dono ver "3 pendentes" e não conseguir fechar 3.
 *
 * As janelas:
 * - **Concluir** exige que o atendimento tenha COMEÇADO. Durante ele é permitido —
 *   quem está no balcão sabe que acabou mais cedo. Antes de começar é sempre erro
 *   de clique.
 * - **Falta** exige que o horário tenha TERMINADO. Antes disso o cliente ainda pode
 *   chegar, e marcar falta cedo estragaria o histórico de quem chegou atrasado.
 * - **Cancelar** vale enquanto não houver desfecho, inclusive no passado: alguém
 *   pode estar limpando a agenda de ontem.
 *
 * Os mesmos limites são reaplicados no servidor (completeAppointmentService /
 * markNoShowService). Isto aqui é a camada que evita oferecer o que vai ser
 * recusado, não a trava.
 */
export function availableOutcomes(
  appointment: { status: string; startTime: Date; endTime: Date },
  now: Date = new Date()
): AvailableOutcomes {
  if (isTerminalStatus(appointment.status)) {
    return { canComplete: false, canMarkNoShow: false, canCancel: false, isSettled: true }
  }

  const t = now.getTime()
  return {
    canComplete: appointment.startTime.getTime() <= t,
    canMarkNoShow: appointment.endTime.getTime() <= t,
    canCancel: true,
    isSettled: false,
  }
}
