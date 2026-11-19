"use client"

import { useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ArrowLeft, Building2 } from "lucide-react"
import { formatBRL } from "@/lib/utils/money.utils"
import type { OrganizationData } from "@/app/actions/organization"
import { ORGANIZATION_ROLE_LABELS } from "@repo/db/src/domain/organization"
import { ExportCsvButton, type CsvSheet } from "@/components/reports/export-csv-button"
import { csvFileName, csvMoney } from "@/lib/utils/csv.utils"
import { controlClass, formatCalendarDate, labelClass } from "../inventory/inventory-ui"

const money = (cents: number | null) => (cents === null ? "—" : formatBRL(cents / 100))
const percent = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("pt-BR")}%`)

const thClass = "px-3 py-2 text-[11px] uppercase font-semibold tracking-wider text-muted-foreground text-left"
const tdClass = "px-3 py-2 text-sm text-foreground text-left"
const numClass = "px-3 py-2 text-sm text-foreground text-right tabular-nums"
const numHeadClass = `${thClass} !text-right`

/**
 * Organização (docs/ROADMAP.md, fase 9, fatia 9g, caminho A): as unidades do dono
 * lado a lado, no período, e a equipe de todas numa lista só.
 *
 * Só leitura. Para mexer na equipe ou ver o detalhe, o nome da unidade leva para
 * o salão dela.
 */
export function OrganizationClient({ salonId, data }: { salonId: string; data: OrganizationData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function navigate(next: { from?: string; to?: string }) {
    const params = new URLSearchParams({ from: next.from ?? data.from, to: next.to ?? data.to })
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  const { rows, totals } = data.units
  const single = rows.length === 1

  function sheet(): CsvSheet {
    return {
      fileName: csvFileName("Organização", data.from, data.to),
      headers: ["Unidade", "Faturamento", "Parte (%)", "Comandas", "Ticket médio", "Clientes que compraram", "Agendamentos", "Clientes cadastrados", "Profissionais ativos"],
      rows: rows.map((row) => [
        row.name,
        csvMoney(row.revenueCents),
        row.sharePercent,
        row.sales,
        csvMoney(row.averageTicketCents),
        row.buyers,
        row.appointments,
        row.customers,
        row.professionals,
      ]),
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar pb-8">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Building2 size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Organização</h2>
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
          <label htmlFor="organization-from" className={labelClass}>
            De
          </label>
          <input
            id="organization-from"
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
          <label htmlFor="organization-to" className={labelClass}>
            Até
          </label>
          <input
            id="organization-to"
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

      {single && (
        <p role="status" className="bg-muted/50 border border-border rounded-md p-3 text-xs text-muted-foreground">
          Você é dono de uma unidade só. Esta tela passa a comparar quando houver mais de um salão na sua conta.
        </p>
      )}

      <section className="bg-card border border-border rounded-md overflow-x-auto" aria-labelledby="organization-units">
        <h3 id="organization-units" className="px-3 pt-3 text-sm font-bold text-foreground">
          Unidades ({rows.length})
        </h3>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass}>Unidade</th>
              <th className={numHeadClass}>Faturamento</th>
              <th className={numHeadClass}>Parte</th>
              <th className={numHeadClass}>Comandas</th>
              <th className={numHeadClass}>Ticket médio</th>
              <th className={numHeadClass}>Clientes que compraram</th>
              <th className={numHeadClass}>Agendamentos</th>
              <th className={numHeadClass}>Clientes cadastrados</th>
              <th className={numHeadClass}>Profissionais</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.salonId}>
                <td className={tdClass}>
                  <Link href={`/${row.salonId}/dashboard`} className="hover:underline">
                    {row.name}
                  </Link>
                  {row.salonId === salonId && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                      Você está aqui
                    </span>
                  )}
                </td>
                <td className={`${numClass} font-semibold`}>{money(row.revenueCents)}</td>
                <td className={numClass}>{percent(row.sharePercent)}</td>
                <td className={numClass}>{row.sales}</td>
                <td className={numClass}>{money(row.averageTicketCents)}</td>
                <td className={numClass}>{row.buyers}</td>
                <td className={numClass}>{row.appointments}</td>
                <td className={numClass}>{row.customers}</td>
                <td className={numClass}>{row.professionals}</td>
              </tr>
            ))}
          </tbody>
          {!single && (
            <tfoot className="border-t border-border">
              <tr>
                <td className={`${tdClass} font-bold`}>Organização</td>
                <td className={`${numClass} font-bold`}>{money(totals.revenueCents)}</td>
                <td className={numClass} />
                <td className={`${numClass} font-bold`}>{totals.sales}</td>
                <td className={`${numClass} font-bold`}>{money(totals.averageTicketCents)}</td>
                <td className={`${numClass} font-bold`}>{totals.buyers}</td>
                <td className={`${numClass} font-bold`}>{totals.appointments}</td>
                <td className={`${numClass} font-bold`}>{totals.customers}</td>
                <td className={`${numClass} font-bold`}>{totals.professionals}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <p className="text-xs text-muted-foreground">
        Faturamento, comandas e clientes que compraram saem das comandas faturadas do período, pelo dia da comanda.
        Agendamentos são os não cancelados do período. Clientes cadastrados e profissionais ativos são os de hoje. A
        linha da organização é uma soma: cada unidade tem o seu cadastro, então a mesma pessoa em duas unidades conta
        duas vezes.
      </p>

      <section className="bg-card border border-border rounded-md overflow-x-auto" aria-labelledby="organization-members">
        <h3 id="organization-members" className="px-3 pt-3 text-sm font-bold text-foreground">
          Equipe ({data.members.length})
        </h3>
        {data.members.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum profissional cadastrado nas unidades.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={thClass}>Nome</th>
                <th className={thClass}>E-mail</th>
                <th className={thClass}>Acesso</th>
                <th className={thClass}>Unidades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.members.map((member) => (
                <tr key={member.key}>
                  <td className={tdClass}>{member.name}</td>
                  <td className={tdClass}>{member.email || "—"}</td>
                  <td className={tdClass}>{member.hasLogin ? "Com login" : "Sem login"}</td>
                  <td className={tdClass}>
                    <ul className="flex flex-col gap-0.5">
                      {member.units.map((unit) => (
                        <li key={unit.professionalId}>
                          <Link href={`/${unit.salonId}/team`} className="hover:underline">
                            {unit.salonName}
                          </Link>
                          <span className="text-muted-foreground">
                            {" "}
                            · {ORGANIZATION_ROLE_LABELS[unit.role] ?? unit.role}
                            {unit.isActive ? "" : " · inativo"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Uma linha por pessoa: cadastros com o mesmo login ou o mesmo e-mail em unidades diferentes são a mesma pessoa.
        Para incluir alguém numa unidade, abra a Equipe dela pelo nome da unidade.
      </p>
    </div>
  )
}
