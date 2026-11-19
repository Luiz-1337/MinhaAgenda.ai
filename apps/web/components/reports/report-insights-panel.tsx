"use client"

import { useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { AlertTriangle, Lightbulb, Loader2, Sparkles, TrendingUp } from "lucide-react"
import { getReportInsights, type ReportInsightsResult } from "@/app/actions/report-insights"
import type { ReportInsightImpact, ReportInsightItem, ReportInsightScreen } from "@repo/db"

const IMPACT_LABEL: Record<ReportInsightImpact, string> = {
  alto: "Impacto alto",
  medio: "Impacto médio",
  baixo: "Impacto baixo",
}

const IMPACT_CLASS: Record<ReportInsightImpact, string> = {
  alto: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  medio: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  baixo: "bg-muted text-muted-foreground",
}

const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})

function ItemList({
  title,
  icon,
  items,
}: {
  title: string
  icon: React.ReactNode
  items: ReportInsightItem[]
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h4>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="text-sm">
            <p className="font-semibold text-foreground">{item.title}</p>
            <p className="text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * "Análise com IA" de uma tela de relatório (docs/ROADMAP.md, fase 9, fatia 9h).
 *
 * Manda para o servidor só QUAL tela e os filtros da URL: os números são
 * carregados de novo lá, pela action da própria tela. A análise não fica
 * guardada — muda o período, a tela recarrega e o painel volta ao botão.
 */
export function ReportInsightsPanel({ salonId, screen }: { salonId: string; screen: ReportInsightScreen }) {
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<ReportInsightsResult | null>(null)

  function generate() {
    const query: Record<string, string> = {}
    searchParams.forEach((value, key) => {
      if (value) query[key] = value
    })

    startTransition(async () => {
      const response = await getReportInsights({ salonId, screen, query })
      if ("error" in response) {
        toast.error(response.error)
        return
      }
      setResult(response)
    })
  }

  const { insights } = result ?? {}

  return (
    <section className="bg-card border border-border rounded-md p-4 space-y-4" aria-live="polite">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles size={18} className="mt-0.5 text-accent" />
          <div>
            <h3 className="text-sm font-bold text-foreground">Análise com IA</h3>
            <p className="text-xs text-muted-foreground">
              A IA lê os números desta tela e aponta onde o salão pode melhorar. Usa créditos de IA do salão; nome e
              telefone de cliente não são enviados.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="flex-shrink-0 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {isPending ? "Analisando…" : result ? "Gerar de novo" : "Gerar análise"}
        </button>
      </div>

      {insights && (
        <div className="space-y-4 border-t border-border pt-4">
          {insights.summary && <p className="text-sm text-foreground">{insights.summary}</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <ItemList
              title="O que está indo bem"
              icon={<TrendingUp size={13} className="text-emerald-600 dark:text-emerald-400" />}
              items={insights.highlights}
            />
            <ItemList
              title="Pontos de atenção"
              icon={<AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />}
              items={insights.warnings}
            />
          </div>

          {insights.actions.length > 0 && (
            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <Lightbulb size={13} className="text-accent" />
                O que fazer
              </h4>
              <ol className="space-y-2">
                {insights.actions.map((action, index) => (
                  <li key={index} className="text-sm">
                    <p className="font-semibold text-foreground">
                      {index + 1}. {action.title}
                      <span
                        className={`ml-2 align-middle px-1.5 py-0.5 rounded text-[10px] font-semibold ${IMPACT_CLASS[action.impact]}`}
                      >
                        {IMPACT_LABEL[action.impact]}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{action.detail}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {result && (
            <p className="text-[11px] text-muted-foreground">
              Gerada às {timeFormat.format(new Date(result.generatedAt))}
              {result.creditsUsed > 0
                ? ` · ${result.creditsUsed.toLocaleString("pt-BR")} ${result.creditsUsed === 1 ? "crédito" : "créditos"}`
                : ""}
              {" · "}A IA pode errar: confira os números da tela antes de decidir.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
