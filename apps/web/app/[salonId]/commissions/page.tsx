import Link from "next/link"
import { Percent, Settings2, ShieldOff } from "lucide-react"
import { centsToNumeric } from "@repo/db"
import { getCommissionStatement } from "@/app/actions/commissions"
import { formatBRL } from "@/lib/utils/money.utils"
import type { CommissionEntryDTO } from "@/lib/types/commission"
import { CommissionFilters } from "./commission-filters"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function money(cents: number): string {
  return formatBRL(centsToNumeric(cents))
}

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/** A regra usada no item: "50%" ou "R$ 10,00 fixo". */
function rateLabel(entry: Pick<CommissionEntryDTO, "rateKind" | "rateValue">): string {
  if (entry.rateKind === "fixed") return `${formatBRL(entry.rateValue)} fixo`
  return `${Number(entry.rateValue).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

export default async function CommissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão. Período ausente vira o mês
  // corrente em Brasília; sem "ver de todos", só o extrato da própria pessoa.
  const statement = await getCommissionStatement(salonId, {
    from: first(query.from) || undefined,
    to: first(query.to) || undefined,
    professionalId: first(query.professional) || undefined,
  })

  if ("error" in statement) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Comissões indisponíveis</h2>
        <p className="text-sm text-muted-foreground max-w-sm">{statement.error}</p>
      </div>
    )
  }

  const { totals } = statement
  // A coluna "Auxiliar" só aparece quando alguma comissão do período foi dividida.
  const showAssistant = totals.assistantCents > 0
  const assistantItems = statement.byProfessional.reduce((sum, row) => sum + row.assistantCount, 0)

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <Percent size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Comissões</h2>
            <p className="text-xs text-muted-foreground">
              Calculadas no faturamento de cada comanda, pela data em que ficam disponíveis.
            </p>
          </div>
        </div>
        {statement.canConfigure && (
          <Link
            href={`/${salonId}/commissions/settings`}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/70 border border-border text-foreground rounded-lg text-sm font-semibold transition-colors"
          >
            <Settings2 size={16} />
            Configurar
          </Link>
        )}
      </div>

      <CommissionFilters
        from={statement.from}
        to={statement.to}
        professionalId={statement.professionalId}
        professionals={statement.professionals}
        showAllOption={statement.canViewAll}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Valor dos itens" value={money(totals.baseCents)} hint={`${totals.count} ${totals.count === 1 ? "item" : "itens"}`} />
        <Stat
          label="Comissões"
          value={money(totals.grossCents)}
          hint={
            assistantItems > 0
              ? `Antes das taxas · inclui ${assistantItems} como auxiliar`
              : "Antes das taxas"
          }
        />
        <Stat label="Taxas" value={money(totals.feeCents)} hint="Parte das taxas de pagamento" />
        <Stat
          label="A receber"
          value={money(totals.amountCents)}
          hint={
            showAssistant
              ? `Comissões menos taxas e ${money(totals.assistantCents)} repassados a auxiliar`
              : "Comissões menos taxas"
          }
        />
      </div>

      {statement.pending.count > 0 && (
        <p role="status" className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-3 text-sm text-amber-800 dark:text-amber-200">
          {statement.pending.count === 1 ? "1 comissão" : `${statement.pending.count} comissões`} somando{" "}
          <span className="font-bold">{money(statement.pending.amountCents)}</span> ainda sem data: aguardam o cliente
          pagar o valor em aberto da comanda. Não entram nos totais acima.
        </p>
      )}

      {statement.byProfessional.length > 1 && (
        <section className="bg-card border border-border rounded-md">
          <h3 className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Por profissional
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-right font-semibold">Itens</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor dos itens</th>
                  <th scope="col" className="p-3 text-right font-semibold">Comissões</th>
                  <th scope="col" className="p-3 text-right font-semibold">Taxas</th>
                  {showAssistant && <th scope="col" className="p-3 text-right font-semibold">Auxiliar</th>}
                  <th scope="col" className="p-3 text-right font-semibold">A receber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statement.byProfessional.map((row) => (
                  <tr key={row.professionalId}>
                    <th scope="row" className="p-3 text-left font-semibold text-foreground">{row.professionalName}</th>
                    <td className="p-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {row.count}
                      {row.assistantCount > 0 && ` + ${row.assistantCount} como auxiliar`}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{money(row.baseCents)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{money(row.grossCents)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{money(row.feeCents)}</td>
                    {showAssistant && (
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{money(row.assistantCents)}</td>
                    )}
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground">{money(row.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="bg-card border border-border rounded-md">
        <h3 className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Detalhadas
        </h3>
        {statement.rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Percent size={32} className="mb-3 opacity-50" />
            <p>Nenhuma comissão no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Comanda</th>
                  <th scope="col" className="p-3 text-left font-semibold">Item</th>
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-right font-semibold">Regra</th>
                  <th scope="col" className="p-3 text-right font-semibold">Comissão</th>
                  <th scope="col" className="p-3 text-right font-semibold">Taxa</th>
                  {showAssistant && <th scope="col" className="p-3 text-right font-semibold">Auxiliar</th>}
                  <th scope="col" className="p-3 text-right font-semibold">A receber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statement.rows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                      {entry.releaseDate ? formatDate(entry.releaseDate) : "—"}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Link
                        href={`/${salonId}/sales/${entry.saleId}`}
                        className="font-mono font-semibold text-accent hover:underline"
                      >
                        #{entry.saleNumber}
                      </Link>
                      {entry.customerName && <span className="text-muted-foreground"> · {entry.customerName}</span>}
                    </td>
                    <td className="p-3 text-foreground">
                      {entry.description}
                      {Number(entry.quantity) !== 1 && (
                        <span className="text-muted-foreground"> × {Number(entry.quantity).toLocaleString("pt-BR")}</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {entry.professionalName}
                      {entry.role === "assistant" && (
                        <span className="ml-2 text-[11px] font-semibold uppercase text-accent">Auxiliar</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{formatBRL(entry.baseAmount)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground whitespace-nowrap">{rateLabel(entry)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{formatBRL(entry.grossAmount)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{formatBRL(entry.feeAmount)}</td>
                    {showAssistant && (
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                        {Number(entry.assistantDeduction) > 0 ? formatBRL(entry.assistantDeduction) : "—"}
                      </td>
                    )}
                    <td className="p-3 text-right font-mono tabular-nums font-semibold text-foreground">{formatBRL(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {statement.truncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando as primeiras {statement.rows.length} linhas. Os totais são do período inteiro — filtre por
            profissional ou reduza o período para ver o restante.
          </p>
        )}
      </section>
    </div>
  )
}
