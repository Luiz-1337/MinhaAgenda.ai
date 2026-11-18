"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, Copy, Pencil, Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { copyGoals, saveGoalTargets } from "@/app/actions/goals"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { GoalRowDTO, GoalsDTO } from "@/lib/types/goals"
import type { GoalMetric, GoalPace } from "@repo/db"
import { Modal, controlClass, iconButtonClass, inputClass, labelClass } from "../inventory/inventory-ui"

const METRICS: { key: GoalMetric; label: string; money: boolean }[] = [
  { key: "revenue", label: "Faturamento", money: true },
  { key: "services", label: "Serviços", money: true },
  { key: "products", label: "Produtos", money: true },
  { key: "sales_count", label: "Comandas", money: false },
]

const PACE_LABEL: Record<GoalPace, string> = {
  reached: "Meta batida",
  on_track: "No ritmo",
  behind: "Abaixo do ritmo",
  missed: "Não bateu",
  upcoming: "Ainda não começou",
}

const PACE_CLASS: Record<GoalPace, string> = {
  reached: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  on_track: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  behind: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  missed: "bg-red-500/10 text-red-700 dark:text-red-400",
  upcoming: "bg-muted text-muted-foreground",
}

const BAR_CLASS: Record<GoalPace, string> = {
  reached: "bg-emerald-500",
  on_track: "bg-emerald-500",
  behind: "bg-amber-500",
  missed: "bg-red-500",
  upcoming: "bg-muted-foreground/40",
}

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

/** "2026-11" → "novembro de 2026". */
function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`
}

/** O valor na unidade do indicador: centavos viram reais; comandas, número. */
function formatValue(value: number, money: boolean): string {
  return money ? formatBRL(value / 100) : value.toLocaleString("pt-BR")
}

type Draft = { row: GoalRowDTO; values: Record<GoalMetric, string> }

function draftFor(row: GoalRowDTO): Draft {
  const values = {} as Record<GoalMetric, string>
  for (const metric of METRICS) {
    const target = row.metrics[metric.key].progress?.target
    values[metric.key] =
      target === undefined
        ? ""
        : metric.money
          ? (target / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : String(target)
  }
  return { row, values }
}

/**
 * Metas por mês (docs/ROADMAP.md, fase 6, fatia 6e): o salão e cada profissional,
 * com a meta, o realizado (das comandas faturadas do mês) e o ritmo.
 *
 * O mês vive na URL (`?month=YYYY-MM`).
 */
export function GoalsClient({ salonId, data }: { salonId: string; data: GoalsDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFrom, setCopyFrom] = useState(data.previousMonth)

  function goTo(month: string) {
    startTransition(() => router.push(`${pathname}?month=${month}`))
  }

  function submitTargets() {
    if (!draft) return

    const targets = {} as Record<GoalMetric, number | null>
    for (const metric of METRICS) {
      const raw = draft.values[metric.key].trim()
      if (!raw) {
        targets[metric.key] = null
        continue
      }
      const value = metric.money ? parseBRL(raw) : Number(raw.replace(/\./g, ""))
      if (value === null || !Number.isFinite(value) || value < 0 || (!metric.money && !Number.isInteger(value))) {
        toast.error(`Meta de ${metric.label.toLowerCase()} inválida`)
        return
      }
      targets[metric.key] = value
    }

    startTransition(async () => {
      const result = await saveGoalTargets({
        salonId,
        month: data.month,
        professionalId: draft.row.professionalId,
        targets,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Metas salvas")
      setDraft(null)
      router.refresh()
    })
  }

  function submitCopy() {
    if (!/^\d{4}-\d{2}$/.test(copyFrom)) {
      toast.error("Escolha o mês de origem")
      return
    }
    startTransition(async () => {
      const result = await copyGoals({ salonId, fromMonth: copyFrom, toMonth: data.month })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      const { copied, skipped } = result.data ?? { copied: 0, skipped: 0 }
      toast.success(
        copied === 0
          ? "Nada a copiar: este mês já tem todas essas metas"
          : `${copied} ${copied === 1 ? "meta copiada" : "metas copiadas"}${skipped > 0 ? ` (${skipped} já existiam ou são de quem saiu)` : ""}`
      )
      setCopyOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Target size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Metas</h2>
            <p className="text-xs text-muted-foreground">
              A meta do mês, do salão e de cada profissional, e quanto dela as comandas faturadas já alcançaram.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={isPending}>
            <Copy size={16} />
            Copiar metas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-card p-3 rounded-md border border-border">
        <button
          type="button"
          onClick={() => goTo(data.previousMonth)}
          disabled={isPending}
          aria-label={`Mês anterior: ${monthLabel(data.previousMonth)}`}
          className={iconButtonClass}
        >
          <ChevronLeft size={16} />
        </button>
        <label htmlFor="goals-month" className="sr-only">
          Mês
        </label>
        <input
          id="goals-month"
          type="month"
          defaultValue={data.month}
          disabled={isPending}
          onChange={(event) => {
            if (/^\d{4}-\d{2}$/.test(event.target.value)) goTo(event.target.value)
          }}
          className={controlClass}
        />
        <button
          type="button"
          onClick={() => goTo(data.nextMonth)}
          disabled={isPending}
          aria-label={`Mês seguinte: ${monthLabel(data.nextMonth)}`}
          className={iconButtonClass}
        >
          <ChevronRight size={16} />
        </button>
        <p className="text-sm font-semibold text-foreground ml-1 first-letter:uppercase">{monthLabel(data.month)}</p>
        {data.month !== data.currentMonth && (
          <Button variant="ghost" size="sm" onClick={() => goTo(data.currentMonth)} disabled={isPending}>
            Mês atual
          </Button>
        )}
      </div>

      {!data.hasGoals && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          Nenhuma meta definida para {monthLabel(data.month)}.
          {data.can.manage ? " Defina no lápis de cada linha, ou copie as de outro mês." : ""}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {data.rows.map((row) => (
          <section
            key={row.professionalId ?? "salon"}
            className="bg-card border border-border rounded-md"
            aria-label={`Metas de ${row.name}`}
          >
            <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">
                {row.name}
                {row.professionalId === null && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">todos os profissionais</span>
                )}
              </h3>
              {data.can.manage && (
                <button
                  type="button"
                  onClick={() => setDraft(draftFor(row))}
                  disabled={isPending}
                  aria-label={`Definir as metas de ${row.name}`}
                  className={iconButtonClass}
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {METRICS.map((metric) => {
                const cell = row.metrics[metric.key]
                const progress = cell.progress
                return (
                  <div key={metric.key} className="p-3 flex flex-col gap-1.5">
                    <dt className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                      {metric.label}
                    </dt>
                    <dd className="flex flex-col gap-1.5">
                      <span className="text-lg font-bold tabular-nums text-foreground">
                        {formatValue(cell.achieved, metric.money)}
                      </span>
                      {progress ? (
                        <>
                          <span
                            className="h-2 rounded-full bg-muted overflow-hidden"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.min(100, progress.percent)}
                            aria-label={`${metric.label} de ${row.name}: ${progress.percent}% da meta`}
                          >
                            <span
                              className={`block h-full rounded-full ${BAR_CLASS[progress.pace]}`}
                              style={{ width: `${Math.min(100, progress.percent)}%` }}
                            />
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {progress.percent}% de {formatValue(progress.target, metric.money)}
                            {progress.remaining > 0 ? ` · faltam ${formatValue(progress.remaining, metric.money)}` : ""}
                          </span>
                          <span
                            className={`self-start px-2 py-0.5 rounded text-[11px] font-semibold ${PACE_CLASS[progress.pace]}`}
                          >
                            {PACE_LABEL[progress.pace]}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem meta</span>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        O realizado soma os itens das comandas faturadas no mês. Na linha do profissional entra o que ele executou ou
        vendeu; “Comandas” conta as comandas em que ele aparece. O ritmo compara o realizado com a parte da meta que
        os dias corridos do mês pedem.
      </p>

      {draft && (
        <Modal title={`Metas de ${draft.row.name}`} onClose={() => setDraft(null)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground first-letter:uppercase">{monthLabel(data.month)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {METRICS.map((metric) => (
                <div key={metric.key} className="flex flex-col gap-1">
                  <label htmlFor={`goal-${metric.key}`} className={labelClass}>
                    {metric.label}
                    {metric.money ? " (R$)" : ""}
                  </label>
                  <input
                    id={`goal-${metric.key}`}
                    type="text"
                    inputMode={metric.money ? "decimal" : "numeric"}
                    placeholder={metric.money ? "0,00" : "0"}
                    value={draft.values[metric.key]}
                    disabled={isPending}
                    onChange={(event) =>
                      setDraft({ ...draft, values: { ...draft.values, [metric.key]: event.target.value } })
                    }
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Em branco, o indicador fica sem meta.</p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitTargets} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      {copyOpen && (
        <Modal title="Copiar metas" onClose={() => setCopyOpen(false)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="goals-copy-from" className={labelClass}>
                Copiar as metas de
              </label>
              <input
                id="goals-copy-from"
                type="month"
                value={copyFrom}
                disabled={isPending}
                onChange={(event) => setCopyFrom(event.target.value)}
                className={inputClass}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              As metas desse mês são copiadas para <span className="font-semibold">{monthLabel(data.month)}</span>. O
              que {monthLabel(data.month)} já tem fica como está, e metas de quem não está mais ativo não são copiadas.
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setCopyOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCopy} disabled={isPending}>
              Copiar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
