"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import type { AppointmentReportData } from "@/app/actions/agenda-reports"
import {
  APPOINTMENT_ORIGIN_LABELS,
  APPOINTMENT_REPORT_VIEWS,
  APPOINTMENT_REPORT_VIEW_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentReportView,
  type ReportAppointment,
} from "@repo/db/src/domain/agenda-reports"
import { controlClass, formatCalendarDate, labelClass } from "../../inventory/inventory-ui"

const thClass = "px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground text-left"
const tdClass = "px-3 py-2 text-sm text-foreground text-left"
const numClass = "px-3 py-2 text-sm text-foreground text-right tabular-nums"
const numHeadClass = `${thClass} !text-right`

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

function AppointmentTable({ rows, cancelled }: { rows: ReportAppointment[]; cancelled?: boolean }) {
  return (
    <table className="w-full">
      <thead className="border-b border-border">
        <tr>
          <th className={thClass}>Dia e hora</th>
          <th className={thClass}>Cliente</th>
          <th className={thClass}>Serviço</th>
          <th className={thClass}>Profissional</th>
          {cancelled ? (
            <>
              <th className={thClass}>Cancelado em</th>
              <th className={thClass}>Por quem</th>
              <th className={thClass}>Motivo</th>
            </>
          ) : (
            <th className={thClass}>Situação</th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={`${tdClass} tabular-nums whitespace-nowrap`}>
              {formatCalendarDate(row.day)} {row.time}
            </td>
            <td className={tdClass}>{row.customerName}</td>
            <td className={tdClass}>{row.serviceName}</td>
            <td className={tdClass}>{row.professionalName}</td>
            {cancelled ? (
              <>
                <td className={`${tdClass} tabular-nums`}>{row.cancelledDay ? formatCalendarDate(row.cancelledDay) : "—"}</td>
                <td className={tdClass}>{row.cancelledByName ?? "—"}</td>
                <td className={tdClass}>{row.cancelReason ?? "—"}</td>
              </>
            ) : (
              <td className={tdClass}>{APPOINTMENT_STATUS_LABELS[row.status]}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Relatórios de agendamentos (docs/ROADMAP.md, fase 9, fatia 9c): todos,
 * cancelados, origem e criação. O relatório e o período vivem na URL.
 */
export function AppointmentReportsClient({ salonId, data }: { salonId: string; data: AppointmentReportData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { view?: AppointmentReportView; from?: string; to?: string }) {
    const params = new URLSearchParams({
      view: next.view ?? data.view,
      from: next.from ?? data.from,
      to: next.to ?? data.to,
    })
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR")}%`)

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {APPOINTMENT_REPORT_VIEW_LABELS[data.view]}
          </h2>
          <Link
            href={`/${salonId}/reports`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> Todos os relatórios
          </Link>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-report-view" className={labelClass}>
            Relatório
          </label>
          <select
            id="appointment-report-view"
            value={data.view}
            disabled={isPending}
            onChange={(event) => navigate({ view: event.target.value as AppointmentReportView })}
            className={controlClass}
          >
            {APPOINTMENT_REPORT_VIEWS.map((view) => (
              <option key={view} value={view}>
                {APPOINTMENT_REPORT_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-report-from" className={labelClass}>
            De
          </label>
          <input
            id="appointment-report-from"
            type="date"
            defaultValue={data.from}
            disabled={isPending}
            onChange={(event) => {
              if (event.target.value) navigate({ from: event.target.value })
            }}
            className={controlClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="appointment-report-to" className={labelClass}>
            Até
          </label>
          <input
            id="appointment-report-to"
            type="date"
            defaultValue={data.to}
            disabled={isPending}
            onChange={(event) => {
              if (event.target.value) navigate({ to: event.target.value })
            }}
            className={controlClass}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:pb-2.5">
          {data.view === "creation" ? "Criados de " : "Atendimentos de "}
          {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
        </p>
      </div>

      {data.truncated && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          O período tem mais agendamentos do que o relatório lê. Os números abaixo são só do que foi lido: escolha um
          período menor.
        </p>
      )}

      {data.view === "all" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Stat label="Total" value={String(data.counts.total)} />
            {APPOINTMENT_STATUSES.map((status) => (
              <Stat key={status} label={APPOINTMENT_STATUS_LABELS[status]} value={String(data.counts[status])} />
            ))}
          </div>
          <div className="bg-card border border-border rounded-md overflow-x-auto">
            {data.rows.length === 0 ? <Empty>Nenhum agendamento no período.</Empty> : <AppointmentTable rows={data.rows} />}
          </div>
          <p className="text-xs text-muted-foreground">
            Pelo dia do atendimento, de todos os profissionais. Bloqueios de horário não entram.
          </p>
        </>
      )}

      {data.view === "cancelled" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Cancelados" value={String(data.rows.length)} />
            <Stat
              label="Sem motivo"
              value={String(data.rows.filter((row) => !row.cancelReason).length)}
              hint="Cancelados sem motivo anotado"
            />
          </div>
          <div className="bg-card border border-border rounded-md overflow-x-auto">
            {data.rows.length === 0 ? (
              <Empty>Nenhum agendamento cancelado no período.</Empty>
            ) : (
              <AppointmentTable rows={data.rows} cancelled />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Pelo dia em que o atendimento ia acontecer. &quot;Por quem&quot; fica em branco quando o cancelamento não
            veio de alguém logado no painel (por exemplo, pela IA).
          </p>
        </>
      )}

      {data.view === "origin" && (
        <>
          <div className="bg-card border border-border rounded-md overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={thClass}>Origem</th>
                  <th className={numHeadClass}>Agendamentos</th>
                  <th className={numHeadClass}>Parte do total</th>
                  <th className={numHeadClass}>Concluídos</th>
                  <th className={numHeadClass}>Faltas</th>
                  <th className={numHeadClass}>Cancelados</th>
                  <th className={numHeadClass}>Comparecimento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.origins.map((row) => (
                  <tr key={row.origin}>
                    <td className={tdClass}>{APPOINTMENT_ORIGIN_LABELS[row.origin]}</td>
                    <td className={numClass}>{row.total}</td>
                    <td className={numClass}>
                      {percent(data.total > 0 ? Math.round((row.total / data.total) * 1000) / 10 : null)}
                    </td>
                    <td className={numClass}>{row.completed}</td>
                    <td className={numClass}>{row.noShow}</td>
                    <td className={numClass}>{row.cancelled}</td>
                    <td className={numClass}>{percent(row.completionPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Pelo dia do atendimento. A origem é a que o cliente tinha quando o agendamento foi criado: anúncio (a
            conversa nasceu de um clique em anúncio) ou orgânico. &quot;Comparecimento&quot; é concluídos ÷ (concluídos +
            faltas + cancelados). O sistema não guarda se foi a IA, o painel ou a página online que marcou.
          </p>
        </>
      )}

      {data.view === "creation" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Criados" value={String(data.report.total)} />
            <Stat
              label="Antecedência média"
              value={
                data.report.averageLeadDays === null
                  ? "—"
                  : `${data.report.averageLeadDays.toLocaleString("pt-BR")} ${data.report.averageLeadDays === 1 ? "dia" : "dias"}`
              }
              hint="Entre marcar e atender"
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-md overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={thClass}>Antecedência</th>
                    <th className={numHeadClass}>Agendamentos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.report.buckets.map((bucket) => (
                    <tr key={bucket.key}>
                      <td className={tdClass}>{bucket.label}</td>
                      <td className={numClass}>{bucket.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-card border border-border rounded-md overflow-x-auto">
              {data.report.days.length === 0 ? (
                <Empty>Nenhum agendamento criado no período.</Empty>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={thClass}>Dia da criação</th>
                      <th className={numHeadClass}>Criados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.report.days.map((day) => (
                      <tr key={day.day}>
                        <td className={`${tdClass} tabular-nums`}>{formatCalendarDate(day.day)}</td>
                        <td className={numClass}>{day.created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Pelo dia em que o agendamento foi CRIADO, qualquer que seja a situação dele hoje. Agendamento registrado
            depois do atendimento conta como &quot;no mesmo dia&quot;.
          </p>
        </>
      )}
    </div>
  )
}
