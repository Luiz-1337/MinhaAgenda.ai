"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { ProfessionalPanelData } from "@/app/actions/professional-panel"
import { LOW_OCCUPANCY_PERCENT } from "@repo/db/src/domain/professional-panel"
import { ExportCsvButton, type CsvSheet } from "@/components/reports/export-csv-button"
import { csvFileName, csvMoney } from "@/lib/utils/csv.utils"
import { controlClass, formatCalendarDate, labelClass } from "../../inventory/inventory-ui"

const money = (cents: number | null) => (cents === null ? "—" : formatBRL(cents / 100))
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR")}%`)

function hours(minutes: number): string {
  const whole = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${whole}h${String(rest).padStart(2, "0")}` : `${whole}h`
}

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

/**
 * Painel de profissionais (docs/ROADMAP.md, fase 9, fatia 9e): clientes únicos,
 * valor realizado, ticket médio, frequência e ocupação de cada um, no período.
 */
export function ProfessionalPanelClient({ salonId, data }: { salonId: string; data: ProfessionalPanelData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { from?: string; to?: string }) {
    const params = new URLSearchParams({ from: next.from ?? data.from, to: next.to ?? data.to })
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const { rows, totals } = data

  /** A planilha do painel que está na tela (fatia 9f). Horas em número decimal. */
  function sheet(): CsvSheet {
    return {
      fileName: csvFileName("Painel de profissionais", data.from, data.to),
      headers: [
        "Profissional",
        "Ativo",
        "Clientes únicos",
        "Comandas",
        "Valor realizado",
        "Ticket médio",
        "Frequência",
        "Agendamentos",
        "Horas marcadas",
        "Horas de expediente",
        "Ocupação (%)",
      ],
      rows: data.rows.map((row) => [
        row.name,
        row.isActive,
        row.uniqueCustomers,
        row.sales,
        csvMoney(row.revenueCents),
        csvMoney(row.averageTicketCents),
        row.frequency,
        row.appointments,
        row.bookedMinutes / 60,
        row.availableMinutes / 60,
        row.occupancyPercent,
      ]),
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Painel de profissionais</h2>
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
          <label htmlFor="panel-from" className={labelClass}>
            De
          </label>
          <input
            id="panel-from"
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
          <label htmlFor="panel-to" className={labelClass}>
            Até
          </label>
          <input
            id="panel-to"
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
          {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
        </p>
        <ExportCsvButton sheet={sheet} disabled={isPending} />
      </div>

      {data.truncated && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          O período tem mais linhas do que o painel lê. Os números abaixo são só do que foi lido: escolha um período
          menor.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Clientes únicos" value={String(totals.uniqueCustomers)} hint="Do salão, no período" />
        <Stat label="Valor realizado" value={money(totals.revenueCents)} hint="Serviços e produtos faturados" />
        <Stat
          label="Ticket médio"
          value={money(totals.averageTicketCents)}
          hint={`${totals.sales} ${totals.sales === 1 ? "comanda" : "comandas"}`}
        />
        <Stat
          label="Ocupação"
          value={percent(totals.occupancyPercent)}
          hint={`${hours(totals.bookedMinutes)} de ${hours(totals.availableMinutes)}`}
        />
      </div>

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum profissional ativo neste salão.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Profissional</th>
                <th className={numHeadClass}>Clientes únicos</th>
                <th className={numHeadClass}>Valor realizado</th>
                <th className={numHeadClass}>Ticket médio</th>
                <th className={numHeadClass}>Frequência</th>
                <th className={numHeadClass}>Agendamentos</th>
                <th className={numHeadClass}>Ocupação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.professionalId}>
                  <td className={tdClass}>
                    {row.name}
                    {!row.isActive && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                        Inativo
                      </span>
                    )}
                  </td>
                  <td className={numClass}>{row.uniqueCustomers}</td>
                  <td className={`${numClass} font-semibold`}>{money(row.revenueCents)}</td>
                  <td className={numClass}>{money(row.averageTicketCents)}</td>
                  <td className={numClass}>
                    {row.frequency === null ? "—" : `${row.frequency.toLocaleString("pt-BR")}×`}
                  </td>
                  <td className={numClass}>{row.appointments}</td>
                  <td className={numClass}>
                    {row.occupancyPercent === null ? (
                      <span className="text-muted-foreground">sem expediente</span>
                    ) : (
                      <>
                        {percent(row.occupancyPercent)}
                        <span className="block text-[11px] text-muted-foreground">
                          {hours(row.bookedMinutes)} de {hours(row.availableMinutes)}
                        </span>
                        {row.lowOccupancy && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            BAIXA OCUPAÇÃO
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Valor realizado, clientes únicos, ticket médio (valor ÷ comandas) e frequência (comandas ÷ clientes) saem das
        comandas faturadas, pelo dia da comanda: serviço conta para quem executou, produto para quem vendeu. Ocupação é
        o tempo dos agendamentos não cancelados ÷ o tempo de expediente cadastrado (sem os intervalos) nos dias do
        período; abaixo de {LOW_OCCUPANCY_PERCENT}%, o painel marca baixa ocupação. Folgas e bloqueios de horário não
        são descontados do expediente. Os cartões são do salão: o mesmo cliente pode estar com dois profissionais.
      </p>
    </div>
  )
}
