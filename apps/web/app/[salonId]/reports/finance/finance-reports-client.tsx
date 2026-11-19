"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, BarChart3 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { FinanceReportsData } from "@/app/actions/finance-reports"
import {
  FINANCE_REPORT_VIEWS,
  FINANCE_REPORT_VIEW_LABELS,
  type FinanceReportView,
} from "@repo/db/src/domain/finance-reports"
import { controlClass, formatCalendarDate, formatQuantity, labelClass } from "../../inventory/inventory-ui"

const money = (cents: number) => formatBRL(cents / 100)

const thClass = "px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground text-right first:text-left"
const tdClass = "px-3 py-2 text-sm text-foreground text-right tabular-nums first:text-left"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
      {children}
    </p>
  )
}

const TRUNCATED =
  "O período tem mais linhas do que o relatório lê. Os totais abaixo são só do que foi lido: escolha um período menor."

function NetResult({ data }: { data: Extract<FinanceReportsData, { view: "services" | "products" }> }) {
  const { rows, totals } = data.report
  const isServices = data.view === "services"
  const missing = rows.filter((row) => row.costMissing).length

  return (
    <>
      {data.truncated && <Notice>{TRUNCATED}</Notice>}
      {missing > 0 && (
        <Notice>
          {missing} {missing === 1 ? "produto está" : "produtos estão"} sem custo de compra no cadastro: o custo{" "}
          {missing === 1 ? "dele" : "deles"} entrou como zero, e o resultado está maior do que é.
        </Notice>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="Receita" value={money(totals.revenueCents)} hint={`${formatQuantity(totals.quantity)} ${
            isServices
              ? totals.quantity === 1
                ? "atendimento"
                : "atendimentos"
              : totals.quantity === 1
                ? "unidade"
                : "unidades"
          }`}
        />
        <Stat label="Taxas" value={money(totals.feeCents)} hint="Das formas de pagamento" />
        <Stat label="Comissão" value={money(totals.commissionCents)} />
        <Stat label="Custo" value={money(totals.costCents)} hint={isServices ? "Custo fixo do serviço" : "Custo de compra de hoje"} />
        <Stat
          label="Resultado"
          value={money(totals.netCents)}
          hint={totals.marginPercent === null ? undefined : `${totals.marginPercent.toLocaleString("pt-BR")}% da receita`}
        />
      </div>

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum {isServices ? "serviço" : "produto"} em comanda faturada no período.
          </p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>{isServices ? "Serviço" : "Produto"}</th>
                <th className={thClass}>Qtd.</th>
                <th className={thClass}>Receita</th>
                <th className={thClass}>Taxas</th>
                <th className={thClass}>Comissão</th>
                <th className={thClass}>Custo</th>
                <th className={thClass}>Resultado</th>
                <th className={thClass}>Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className={tdClass}>{row.name}</td>
                  <td className={tdClass}>{formatQuantity(row.quantity)}</td>
                  <td className={tdClass}>{money(row.revenueCents)}</td>
                  <td className={tdClass}>{money(row.feeCents)}</td>
                  <td className={tdClass}>{money(row.commissionCents)}</td>
                  <td className={tdClass}>{row.costMissing ? "sem custo" : money(row.costCents)}</td>
                  <td className={`${tdClass} font-semibold`}>{money(row.netCents)}</td>
                  <td className={tdClass}>
                    {row.marginPercent === null ? "—" : `${row.marginPercent.toLocaleString("pt-BR")}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Comandas faturadas, pelo dia da comanda. A receita é o total do item, já com desconto e cupom. A taxa da forma
        de pagamento é repartida entre os itens da comanda, na proporção de cada um.{" "}
        {isServices
          ? "O custo é o custo fixo cadastrado no serviço; o produto consumido no atendimento não entra aqui."
          : "O custo é o custo de compra que o produto tem hoje, e não o do dia da venda."}
      </p>
    </>
  )
}

function Projection({ data }: { data: Extract<FinanceReportsData, { view: "projection" }> }) {
  const { days, totals, overdueReceivableCents, overduePayableCents } = data.report

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Agendado"
          value={money(totals.scheduledCents)}
          hint={`${totals.appointments} ${totals.appointments === 1 ? "agendamento" : "agendamentos"}${
            totals.unpriced > 0 ? ` · ${totals.unpriced} sem preço fechado` : ""
          }`}
        />
        <Stat label="A receber" value={money(totals.receivableCents)} hint="Em aberto, vencendo no período" />
        <Stat label="A pagar" value={money(totals.payableCents)} hint="Em aberto, vencendo no período" />
        <Stat label="Previsto" value={money(totals.netCents)} hint="Agendado + a receber − a pagar" />
      </div>

      {(overdueReceivableCents > 0 || overduePayableCents > 0) && (
        <Notice>
          Fora da projeção, por já estarem vencidos: {money(overdueReceivableCents)} a receber e{" "}
          {money(overduePayableCents)} a pagar.
        </Notice>
      )}

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        {days.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nada agendado, a receber ou a pagar no período.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Dia</th>
                <th className={thClass}>Agendamentos</th>
                <th className={thClass}>Agendado</th>
                <th className={thClass}>A receber</th>
                <th className={thClass}>A pagar</th>
                <th className={thClass}>Previsto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((day) => (
                <tr key={day.day}>
                  <td className={tdClass}>{formatCalendarDate(day.day)}</td>
                  <td className={tdClass}>
                    {day.appointments}
                    {day.unpriced > 0 ? ` (${day.unpriced} sem preço)` : ""}
                  </td>
                  <td className={tdClass}>{money(day.scheduledCents)}</td>
                  <td className={tdClass}>{money(day.receivableCents)}</td>
                  <td className={tdClass}>{money(day.payableCents)}</td>
                  <td className={`${tdClass} font-semibold`}>{money(day.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        De hoje em diante. &quot;Agendado&quot; soma o preço de tabela dos agendamentos pendentes e confirmados que
        ainda não viraram comanda faturada; serviço com faixa de preço entra pelo menor valor, e &quot;sob
        avaliação&quot; não entra. É uma previsão: não conta desconto, falta nem cancelamento.
      </p>
    </>
  )
}

function Statement({ data }: { data: Extract<FinanceReportsData, { view: "statement" }> }) {
  const { statement } = data
  if (!statement) {
    return (
      <p className="bg-card border border-border rounded-md p-4 text-sm text-muted-foreground">
        {data.accounts.length === 0
          ? "O salão ainda não tem conta cadastrada no financeiro."
          : "Conta não encontrada neste salão. Escolha uma conta acima."}
      </p>
    )
  }

  return (
    <>
      {data.truncated && <Notice>{TRUNCATED}</Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Saldo anterior" value={money(statement.openingCents)} hint={`Antes de ${formatCalendarDate(data.from)}`} />
        <Stat label="Entradas" value={money(statement.inCents)} />
        <Stat label="Saídas" value={money(statement.outCents)} />
        <Stat label="Saldo final" value={money(statement.closingCents)} hint={`Em ${formatCalendarDate(data.to)}`} />
      </div>

      <div className="bg-card border border-border rounded-md overflow-x-auto">
        {statement.rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma baixa nesta conta no período.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Dia da baixa</th>
                <th className={`${thClass} !text-left`}>Descrição</th>
                <th className={thClass}>Entrada</th>
                <th className={thClass}>Saída</th>
                <th className={thClass}>Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statement.rows.map((row) => (
                <tr key={row.id}>
                  <td className={tdClass}>{formatCalendarDate(row.day)}</td>
                  <td className={`${tdClass} !text-left`}>{row.description}</td>
                  <td className={tdClass}>{row.direction === "in" ? money(row.netCents) : ""}</td>
                  <td className={tdClass}>{row.direction === "out" ? money(row.netCents) : ""}</td>
                  <td className={`${tdClass} font-semibold`}>{money(row.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Só o que foi baixado na conta, pelo dia da baixa, com o valor líquido (já sem a taxa). Transferências entre
        contas entram. O que está em aberto não aparece.
      </p>
    </>
  )
}

/**
 * Relatórios financeiros (docs/ROADMAP.md, fase 9, fatia 9b): resultado líquido de
 * serviços e de produtos, projeção de faturamento e extrato de contas.
 *
 * O relatório e os filtros vivem na URL: dá para voltar, recarregar, mandar o
 * link e marcar como favorito na central.
 */
export function FinanceReportsClient({ salonId, data }: { salonId: string; data: FinanceReportsData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { view?: FinanceReportView; from?: string; to?: string; account?: string }) {
    const view = next.view ?? data.view
    const params = new URLSearchParams({ view })
    // Trocar de relatório volta ao período padrão dele (a projeção olha para a frente).
    if (!next.view || next.view === data.view) {
      if (view !== "projection") params.set("from", next.from ?? data.from)
      params.set("to", next.to ?? data.to)
    }
    const account = next.account ?? (data.view === "statement" ? data.accountId : null)
    if (view === "statement" && account) params.set("account", account)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <BarChart3 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">{FINANCE_REPORT_VIEW_LABELS[data.view]}</h2>
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
          <label htmlFor="finance-report-view" className={labelClass}>
            Relatório
          </label>
          <select
            id="finance-report-view"
            value={data.view}
            disabled={isPending}
            onChange={(event) => navigate({ view: event.target.value as FinanceReportView })}
            className={controlClass}
          >
            {FINANCE_REPORT_VIEWS.map((view) => (
              <option key={view} value={view}>
                {FINANCE_REPORT_VIEW_LABELS[view]}
              </option>
            ))}
          </select>
        </div>

        {data.view === "statement" && data.accounts.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="finance-report-account" className={labelClass}>
              Conta
            </label>
            <select
              id="finance-report-account"
              value={data.accountId ?? ""}
              disabled={isPending}
              onChange={(event) => {
                if (event.target.value) navigate({ account: event.target.value })
              }}
              className={controlClass}
            >
              {!data.accountId && <option value="">Escolha uma conta…</option>}
              {data.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.isActive ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </div>
        )}

        {data.view !== "projection" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="finance-report-from" className={labelClass}>
              De
            </label>
            <input
              id="finance-report-from"
              type="date"
              defaultValue={data.from}
              disabled={isPending}
              onChange={(event) => {
                if (event.target.value) navigate({ from: event.target.value })
              }}
              className={controlClass}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="finance-report-to" className={labelClass}>
            Até
          </label>
          <input
            id="finance-report-to"
            type="date"
            defaultValue={data.to}
            min={data.view === "projection" ? data.from : undefined}
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
      </div>

      {data.view === "projection" ? (
        <Projection data={data} />
      ) : data.view === "statement" ? (
        <Statement data={data} />
      ) : (
        <NetResult data={data} />
      )}
    </div>
  )
}
