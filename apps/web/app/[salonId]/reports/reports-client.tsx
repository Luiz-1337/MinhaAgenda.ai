"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowRight, Building2, Star } from "lucide-react"
import { setReportFavorite, type ReportsHomeData } from "@/app/actions/reports"
import type { ResolvedReport } from "@repo/db"

function ReportRow({
  salonId,
  report,
  isFavorite,
  disabled,
  onToggle,
}: {
  salonId: string
  report: ResolvedReport
  isFavorite: boolean
  disabled: boolean
  onToggle: (report: ResolvedReport) => void
}) {
  return (
    <li className="py-3 flex items-start gap-3">
      {report.path ? (
        <button
          type="button"
          role="switch"
          aria-checked={isFavorite}
          aria-label={`${isFavorite ? "Tirar dos" : "Pôr nos"} favoritos: ${report.name}`}
          disabled={disabled}
          onClick={() => onToggle(report)}
          className="mt-0.5 p-1 rounded text-muted-foreground hover:text-amber-500 hover:bg-muted disabled:opacity-50"
        >
          <Star size={16} className={isFavorite ? "fill-amber-400 text-amber-400" : ""} />
        </button>
      ) : (
        // Mantém o alinhamento da lista: o que ainda não existe não é favoritável.
        <span className="mt-0.5 p-1" aria-hidden="true">
          <Star size={16} className="text-muted-foreground/20" />
        </span>
      )}

      <div className="min-w-0 mr-auto">
        <p className="text-sm font-medium text-foreground">
          {report.name}
          {!report.path && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
              Em breve{report.planned ? ` · ${report.planned}` : ""}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{report.summary}</p>
      </div>

      {report.path && (
        <Link
          href={`/${salonId}/${report.path}`}
          aria-label={`Abrir: ${report.name}`}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-accent hover:bg-muted"
        >
          Abrir <ArrowRight size={13} />
        </Link>
      )}
    </li>
  )
}

/**
 * A central de relatórios: os favoritos de quem está logado e o catálogo por
 * categoria. Cada linha abre a tela que responde ao relatório; o que ainda não
 * tem tela aparece como "em breve".
 */
export function ReportsClient({ salonId, data }: { salonId: string; data: ReportsHomeData }) {
  const [isPending, startTransition] = useTransition()
  const [favorites, setFavorites] = useState(data.favorites)

  const byKey = new Map(data.categories.flatMap((category) => category.reports).map((report) => [report.key, report]))
  // Favorito de uma tela que a pessoa não abre mais (módulo desligado, permissão
  // tirada) fica guardado, mas não aparece.
  const favoriteReports = favorites.flatMap((key) => {
    const report = byKey.get(key)
    return report?.path ? [report] : []
  })

  function toggle(report: ResolvedReport) {
    const favorite = !favorites.includes(report.key)
    const before = favorites
    setFavorites(favorite ? [...favorites, report.key] : favorites.filter((key) => key !== report.key))
    startTransition(async () => {
      const result = await setReportFavorite({ salonId, reportKey: report.key, favorite })
      if ("error" in result) {
        setFavorites(before)
        toast.error(result.error)
      }
    })
  }

  const available = [...byKey.values()].filter((report) => report.path).length

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Relatórios</h2>
        <p className="text-sm text-muted-foreground">
          {available} de {byKey.size} relatórios disponíveis para você neste salão. Marque com a estrela os que mais
          usa.
        </p>
        {data.ownedSalons > 0 && (
          <Link
            href={`/${salonId}/organization`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <Building2 size={13} />
            Organização: {data.ownedSalons === 1 ? "a sua unidade" : `as suas ${data.ownedSalons} unidades lado a lado`}
          </Link>
        )}
      </div>

      <section className="bg-card border border-border rounded-xl p-4" aria-labelledby="reports-favorites-title">
        <h3 id="reports-favorites-title" className="text-sm font-bold text-foreground">
          Favoritos
        </h3>
        {favoriteReports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nenhum favorito ainda. Use a estrela ao lado de um relatório para trazê-lo para cá.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {favoriteReports.map((report) => (
              <ReportRow key={report.key} salonId={salonId} report={report} isFavorite disabled={isPending} onToggle={toggle} />
            ))}
          </ul>
        )}
      </section>

      {data.categories.map((category) => (
        <section
          key={category.key}
          className="bg-card border border-border rounded-xl p-4"
          aria-labelledby={`reports-${category.key}-title`}
        >
          <h3 id={`reports-${category.key}-title`} className="text-sm font-bold text-foreground">
            {category.label}
          </h3>
          <ul className="divide-y divide-border">
            {category.reports.map((report) => (
              <ReportRow
                key={report.key}
                salonId={salonId}
                report={report}
                isFavorite={favorites.includes(report.key)}
                disabled={isPending}
                onToggle={toggle}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
