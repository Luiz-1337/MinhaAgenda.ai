import Link from "next/link"
import { ArrowLeft, BarChart3, ShieldOff } from "lucide-react"
import { centsToNumeric } from "@repo/db"
import { getFinanceSummary } from "@/app/actions/finance"
import { formatBRL } from "@/lib/utils/money.utils"
import { MonthPicker } from "./month-picker"

function money(cents: number): string {
  return formatBRL(centsToNumeric(cents))
}

/** "2026-11-15" → "15/11". */
function dayLabel(date: string): string {
  const [, month, day] = date.split("-")
  return `${day}/${month}`
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === "bad" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Breakdown({ title, rows, empty }: { title: string; rows: { name: string; cents: number }[]; empty: string }) {
  const total = rows.reduce((sum, row) => sum + row.cents, 0)

  return (
    <section className="bg-card border border-border rounded-md">
      <h3 className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row" className="p-3 text-left font-normal text-foreground">
                  {row.name}
                </th>
                <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                  {total > 0 ? `${Math.round((row.cents / total) * 100)}%` : "—"}
                </td>
                <td className="p-3 text-right font-mono tabular-nums text-foreground">{money(row.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default async function FinanceSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams
  const month = typeof query.month === "string" ? query.month : undefined

  // A action confere sessão, módulo e permissão; mês ausente ou inválido vira o
  // mês corrente em Brasília.
  const summary = await getFinanceSummary(salonId, month)

  if ("error" in summary) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Resumo indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{summary.error}</p>
      </div>
    )
  }

  const result = summary.receivedCents - summary.paidCents

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/${salonId}/finance`}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Voltar para o financeiro"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <BarChart3 size={20} className="text-accent" />
              Resumo do mês
            </h2>
            <p className="text-xs text-muted-foreground">
              Entradas e saídas pelo dia da baixa, já descontadas as taxas. Transferências não entram.
            </p>
          </div>
        </div>
        <MonthPicker month={summary.month} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Recebido" value={money(summary.receivedCents)} />
          <Stat label="Pago" value={money(summary.paidCents)} />
          <Stat
            label="Resultado"
            value={money(result)}
            hint="Recebido menos pago"
            tone={result < 0 ? "bad" : undefined}
          />
          <Stat label="A receber" value={money(summary.toReceiveCents)} hint="Em aberto, vencendo neste mês" />
          <Stat label="A pagar" value={money(summary.toPayCents)} hint="Em aberto, vencendo neste mês" />
          {summary.customerDebt && (
            <Stat
              label="Fiado de clientes"
              value={money(summary.customerDebt.openCents)}
              hint={
                summary.customerDebt.count === 0
                  ? "Nenhuma comanda com valor em aberto"
                  : `${summary.customerDebt.count} ${summary.customerDebt.count === 1 ? "comanda" : "comandas"} · ${money(summary.customerDebt.overdueCents)} vencido · não entra em A receber`
              }
              tone={summary.customerDebt.overdueCents > 0 ? "bad" : undefined}
            />
          )}
          <Stat
            label="Atrasado"
            value={`${money(summary.overdueInCents)} a receber`}
            hint={`${money(summary.overdueOutCents)} a pagar · de qualquer mês`}
            tone={summary.overdueInCents + summary.overdueOutCents > 0 ? "bad" : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Breakdown title="Receitas por categoria" rows={summary.incomeByCategory} empty="Nada recebido no mês." />
          <Breakdown title="Despesas por categoria" rows={summary.expenseByCategory} empty="Nada pago no mês." />
        </div>

        <Breakdown
          title="Recebimentos por forma de pagamento"
          rows={summary.receivedByPaymentMethod}
          empty="Nada recebido no mês."
        />

        <section className="bg-card border border-border rounded-md">
          <h3 className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Fluxo de caixa por dia
          </h3>
          {summary.dailyFlow.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma baixa no mês.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">
                    Dia
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Entradas
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Saídas
                  </th>
                  <th scope="col" className="p-3 text-right font-semibold">
                    Saldo do dia
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.dailyFlow.map((day) => {
                  const net = day.inCents - day.outCents
                  return (
                    <tr key={day.date}>
                      <th scope="row" className="p-3 text-left font-normal text-foreground tabular-nums">
                        {dayLabel(day.date)}
                      </th>
                      <td className="p-3 text-right font-mono tabular-nums text-foreground">{money(day.inCents)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-foreground">{money(day.outCents)}</td>
                      <td
                        className={`p-3 text-right font-mono tabular-nums ${net < 0 ? "text-destructive" : "text-foreground"}`}
                      >
                        {money(net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  )
}
