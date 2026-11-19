"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import type { CustomerReportData } from "@/app/actions/agenda-reports"
import {
  CUSTOMER_REPORT_VIEWS,
  CUSTOMER_REPORT_VIEW_LABELS,
  INACTIVE_DAYS_OPTIONS,
  MONTH_LABELS,
  type CustomerReportView,
} from "@repo/db/src/domain/agenda-reports"
import { formatPhoneBR } from "@/lib/utils/phone.utils"
import { ExportCsvButton, type CsvSheet } from "@/components/reports/export-csv-button"
import { ReportInsightsPanel } from "@/components/reports/report-insights-panel"
import { csvDate, csvFileName } from "@/lib/utils/csv.utils"
import { controlClass, formatCalendarDate, labelClass } from "../../inventory/inventory-ui"

const thClass = "px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground text-left"
const tdClass = "px-3 py-2 text-sm text-foreground text-left"
const numClass = "px-3 py-2 text-sm text-foreground text-right tabular-nums"

/**
 * Relatórios de clientes (docs/ROADMAP.md, fase 9, fatia 9c): aniversariantes do
 * mês e inativos. O relatório e o filtro vivem na URL.
 */
export function CustomerReportsClient({ salonId, data }: { salonId: string; data: CustomerReportData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { view?: CustomerReportView; month?: string; days?: string }) {
    const view = next.view ?? data.view
    const params = new URLSearchParams({ view })
    if (view === "birthdays") {
      const month = next.month ?? (data.view === "birthdays" ? String(data.month) : "")
      if (month) params.set("month", month)
    } else {
      const days = next.days ?? (data.view === "inactive" ? String(data.days) : "")
      if (days) params.set("days", days)
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const customerLink = (id: string, name: string) => (
    <Link href={`/${salonId}/contacts/${id}`} className="hover:underline">
      {name}
    </Link>
  )

  /** A planilha do relatório que está na tela (fatia 9f). O telefone só vai se a tela o mostra. */
  function sheet(): CsvSheet {
    const title = CUSTOMER_REPORT_VIEW_LABELS[data.view]
    const phone = data.showPhones ? ["Telefone"] : []
    if (data.view === "birthdays") {
      return {
        fileName: csvFileName(title, MONTH_LABELS[data.month - 1], data.year),
        headers: ["Dia", "Cliente", "Faz (anos)", ...phone],
        rows: data.rows.map((row) => [
          `${String(row.day).padStart(2, "0")}/${String(data.month).padStart(2, "0")}`,
          row.name,
          row.turning,
          ...(data.showPhones ? [formatPhoneBR(row.phone)] : []),
        ]),
      }
    }
    return {
      fileName: csvFileName(title, `${data.days} dias`, data.today),
      headers: ["Cliente", "Última vez", "Dias sem vir", "Atendimentos", ...phone],
      rows: data.rows.map((row) => [
        row.name,
        csvDate(row.lastVisit),
        row.daysAway,
        row.visits,
        ...(data.showPhones ? [formatPhoneBR(row.phone)] : []),
      ]),
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{CUSTOMER_REPORT_VIEW_LABELS[data.view]}</h2>
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
          <label htmlFor="customer-report-view" className={labelClass}>
            Relatório
          </label>
          <select
            id="customer-report-view"
            value={data.view}
            disabled={isPending}
            onChange={(event) => navigate({ view: event.target.value as CustomerReportView })}
            className={controlClass}
          >
            {CUSTOMER_REPORT_VIEWS.map((view) => (
              <option key={view} value={view}>
                {CUSTOMER_REPORT_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </div>

        {data.view === "birthdays" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="customer-report-month" className={labelClass}>
              Mês
            </label>
            <select
              id="customer-report-month"
              value={data.month}
              disabled={isPending}
              onChange={(event) => navigate({ month: event.target.value })}
              className={controlClass}
            >
              {MONTH_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <label htmlFor="customer-report-days" className={labelClass}>
              Sem vir há
            </label>
            <select
              id="customer-report-days"
              value={data.days}
              disabled={isPending}
              onChange={(event) => navigate({ days: event.target.value })}
              className={controlClass}
            >
              {INACTIVE_DAYS_OPTIONS.map((days) => (
                <option key={days} value={days}>
                  {days} dias ou mais
                </option>
              ))}
            </select>
          </div>
        )}

        <p className="text-xs text-muted-foreground sm:pb-2.5">
          {data.rows.length} {data.rows.length === 1 ? "cliente" : "clientes"}
        </p>
        <ExportCsvButton sheet={sheet} disabled={isPending} />
      </div>

      <ReportInsightsPanel salonId={salonId} screen="customers" />

      {data.truncated && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          Há mais clientes do que o relatório lê. A lista abaixo não está completa.
        </p>
      )}

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        {data.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.view === "birthdays"
              ? "Nenhum cliente com aniversário neste mês. Só entra quem tem a data de nascimento na ficha."
              : "Nenhum cliente inativo com este prazo."}
          </p>
        ) : data.view === "birthdays" ? (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Dia</th>
                <th className={thClass}>Cliente</th>
                <th className={`${thClass} !text-right`}>Faz</th>
                {data.showPhones && <th className={thClass}>Telefone</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className={`${tdClass} tabular-nums`}>
                    {String(row.day).padStart(2, "0")}/{String(data.month).padStart(2, "0")}
                  </td>
                  <td className={tdClass}>{customerLink(row.id, row.name)}</td>
                  <td className={numClass}>
                    {row.turning} {row.turning === 1 ? "ano" : "anos"}
                  </td>
                  {data.showPhones && <td className={`${tdClass} tabular-nums`}>{formatPhoneBR(row.phone)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Última vez</th>
                <th className={`${thClass} !text-right`}>Dias sem vir</th>
                <th className={`${thClass} !text-right`}>Atendimentos</th>
                {data.showPhones && <th className={thClass}>Telefone</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className={tdClass}>{customerLink(row.id, row.name)}</td>
                  <td className={`${tdClass} tabular-nums`}>{formatCalendarDate(row.lastVisit)}</td>
                  <td className={numClass}>{row.daysAway}</td>
                  <td className={numClass}>{row.visits}</td>
                  {data.showPhones && <td className={`${tdClass} tabular-nums`}>{formatPhoneBR(row.phone)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {data.view === "birthdays"
          ? `Aniversários de ${MONTH_LABELS[data.month - 1].toLowerCase()} de ${data.year}, pela data de nascimento da ficha. "Faz" é a idade que a pessoa completa neste ano.`
          : "Quem já veio (atendimento concluído ou comanda faturada), não vem há esse tempo e não tem horário marcado. Quem sumiu há menos tempo vem primeiro. \"Atendimentos\" conta os agendamentos concluídos."}
      </p>
    </div>
  )
}
