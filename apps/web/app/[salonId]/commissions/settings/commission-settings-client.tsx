"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, RefreshCw, Save, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { recalculateCommissions, saveCommissionRules, saveCommissionSettings } from "@/app/actions/commissions"
import {
  COMMISSION_DATE_BASIS_LABELS,
  COMMISSION_DISCOUNT_MODE_LABELS,
  COMMISSION_FEE_MODE_LABELS,
  COMMISSION_RATE_KIND_LABELS,
  COMMISSION_SETTINGS_HINTS,
} from "@/lib/constants/commissions.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
// Caminho do arquivo, não o barrel `@repo/db`: o barrel arrasta o cliente Postgres.
import { DEFAULT_COMMISSION_SETTINGS } from "@repo/db/src/domain/commissions"
import type { CommissionDateBasis, CommissionRateKind, CommissionShareMode } from "@repo/db"
import type { CommissionConfigDTO, CommissionRuleInput } from "@/lib/types/commission"

const DATE_BASES = Object.keys(COMMISSION_DATE_BASIS_LABELS) as CommissionDateBasis[]
const FEE_MODES = Object.keys(COMMISSION_FEE_MODE_LABELS) as CommissionShareMode[]
const DISCOUNT_MODES = Object.keys(COMMISSION_DISCOUNT_MODE_LABELS) as CommissionShareMode[]
const RATE_KINDS = Object.keys(COMMISSION_RATE_KIND_LABELS) as CommissionRateKind[]

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"
const sectionTitleClass =
  "p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground"

type SettingsValues = CommissionConfigDTO["salonSettings"]
type RuleDraft = { kind: CommissionRateKind; value: string }
type Item = { key: string; id: string; name: string; type: "service" | "product" }

const NO_OVERRIDE: SettingsValues = { dateBasis: null, feeMode: null, discountMode: null }

/** Chave de uma regra na tela: alvo ("" = salão) + item. */
function draftKey(scope: string, itemKey: string): string {
  return `${scope}|${itemKey}`
}

function percentLabel(value: string | number): string {
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
}

function ruleLabel(rule: RuleDraft): string {
  return rule.kind === "fixed" ? `${formatBRL(parseBRL(rule.value))} fixo` : percentLabel(parseBRL(rule.value) ?? 0)
}

/** "50.00" → "50"; "12.50" → "12,5". Para abrir o campo como a pessoa digitaria. */
function toFieldValue(value: string): string {
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2, useGrouping: false })
}

export function CommissionSettingsClient({
  salonId,
  config,
  today,
}: {
  salonId: string
  config: CommissionConfigDTO
  /** Hoje em Brasília ("YYYY-MM-DD"), vindo do servidor. */
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Regras gerais do salão. O que nunca foi gravado abre no padrão do sistema.
  const [salonSettings, setSalonSettings] = useState({
    dateBasis: config.salonSettings.dateBasis ?? DEFAULT_COMMISSION_SETTINGS.dateBasis,
    feeMode: config.salonSettings.feeMode ?? DEFAULT_COMMISSION_SETTINGS.feeMode,
    discountMode: config.salonSettings.discountMode ?? DEFAULT_COMMISSION_SETTINGS.discountMode,
  })

  // "" = padrão do salão; senão, o id do profissional.
  const [scope, setScope] = useState("")

  const [overrides, setOverrides] = useState<Record<string, SettingsValues>>(() =>
    Object.fromEntries(
      config.professionals.filter((p) => p.settings).map((p) => [p.id, p.settings as SettingsValues])
    )
  )

  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>(() => {
    const initial: Record<string, RuleDraft> = {}
    for (const rule of config.rules) {
      const itemKey = rule.serviceId ? `s:${rule.serviceId}` : `p:${rule.productId}`
      initial[draftKey(rule.professionalId ?? "", itemKey)] = { kind: rule.kind, value: toFieldValue(rule.value) }
    }
    return initial
  })

  const [recalcFrom, setRecalcFrom] = useState(`${today.slice(0, 8)}01`)
  const [recalcTo, setRecalcTo] = useState(today)
  const [confirmRecalc, setConfirmRecalc] = useState(false)

  const items: Item[] = [
    ...config.services.map((s) => ({ key: `s:${s.id}`, id: s.id, name: s.name, type: "service" as const })),
    ...config.products.map((p) => ({ key: `p:${p.id}`, id: p.id, name: p.name, type: "product" as const })),
  ]

  const professional = config.professionals.find((p) => p.id === scope) ?? null
  const override = professional ? (overrides[professional.id] ?? NO_OVERRIDE) : NO_OVERRIDE

  function run<T>(
    successMessage: (data: T | undefined) => string,
    action: () => Promise<{ error: string } | { success: true; data?: T }>
  ) {
    startTransition(async () => {
      const result = await action()
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(successMessage(result.data))
      router.refresh()
    })
  }

  function saveSalonSettings() {
    run(
      () => "Regras do salão salvas",
      () => saveCommissionSettings({ salonId, professionalId: null, ...salonSettings })
    )
  }

  function saveOverride() {
    if (!professional) return
    run(
      () => `Regras de ${professional.name} salvas`,
      () => saveCommissionSettings({ salonId, professionalId: professional.id, ...override })
    )
  }

  function setOverride(patch: Partial<SettingsValues>) {
    if (!professional) return
    setOverrides((current) => ({ ...current, [professional.id]: { ...override, ...patch } }))
  }

  function setDraft(itemKey: string, patch: Partial<RuleDraft>) {
    const key = draftKey(scope, itemKey)
    setDrafts((current) => {
      const previous: RuleDraft = current[key] ?? { kind: "percent", value: "" }
      return { ...current, [key]: { ...previous, ...patch } }
    })
  }

  function saveRules() {
    const rules: CommissionRuleInput[] = []

    for (const item of items) {
      const draft = drafts[draftKey(scope, item.key)]
      if (!draft || draft.value.trim() === "") continue

      const value = parseBRL(draft.value)
      if (value === null || value < 0 || (draft.kind === "percent" && value > 100)) {
        toast.error(`Comissão inválida em "${item.name}"`)
        return
      }

      rules.push({
        ...(item.type === "service" ? { serviceId: item.id } : { productId: item.id }),
        kind: draft.kind,
        value,
      })
    }

    run(
      () => (professional ? `Comissões de ${professional.name} salvas` : "Comissões por item salvas"),
      () => saveCommissionRules({ salonId, professionalId: professional?.id ?? null, rules })
    )
  }

  function runRecalculate() {
    run<{ sales: number }>(
      (data) => {
        const count = data?.sales ?? 0
        return count === 1 ? "1 comanda recalculada" : `${count} comandas recalculadas`
      },
      () => recalculateCommissions({ salonId, from: recalcFrom, to: recalcTo })
    )
  }

  /** O que vale para o item quando o campo está vazio. */
  function fallbackHint(item: Item): string {
    if (!professional) return "Sem regra: vale o percentual geral de cada profissional"

    const salonRule = drafts[draftKey("", item.key)]
    if (salonRule && salonRule.value.trim() !== "") return `Padrão do salão: ${ruleLabel(salonRule)}`

    return `Percentual geral: ${percentLabel(professional.commissionRate)}`
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link
          href={`/${salonId}/commissions`}
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Voltar para as comissões"
        >
          <ArrowLeft size={18} />
        </Link>
        <Settings2 size={24} className="text-muted-foreground" />
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Configurar comissões</h2>
      </div>

      {/* Regras gerais do salão */}
      <section className="bg-card border border-border rounded-md">
        <h3 className={sectionTitleClass}>Regras do salão</h3>
        <div className="p-4 grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="salon-date-basis" className={labelClass}>
              Quando fica disponível
            </label>
            <select
              id="salon-date-basis"
              value={salonSettings.dateBasis}
              disabled={isPending}
              onChange={(event) =>
                setSalonSettings((current) => ({ ...current, dateBasis: event.target.value as CommissionDateBasis }))
              }
              className={inputClass}
            >
              {DATE_BASES.map((value) => (
                <option key={value} value={value}>
                  {COMMISSION_DATE_BASIS_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{COMMISSION_SETTINGS_HINTS.dateBasis}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="salon-fee-mode" className={labelClass}>
              Taxas de pagamento
            </label>
            <select
              id="salon-fee-mode"
              value={salonSettings.feeMode}
              disabled={isPending}
              onChange={(event) =>
                setSalonSettings((current) => ({ ...current, feeMode: event.target.value as CommissionShareMode }))
              }
              className={inputClass}
            >
              {FEE_MODES.map((value) => (
                <option key={value} value={value}>
                  {COMMISSION_FEE_MODE_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{COMMISSION_SETTINGS_HINTS.feeMode}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="salon-discount-mode" className={labelClass}>
              Descontos
            </label>
            <select
              id="salon-discount-mode"
              value={salonSettings.discountMode}
              disabled={isPending}
              onChange={(event) =>
                setSalonSettings((current) => ({ ...current, discountMode: event.target.value as CommissionShareMode }))
              }
              className={inputClass}
            >
              {DISCOUNT_MODES.map((value) => (
                <option key={value} value={value}>
                  {COMMISSION_DISCOUNT_MODE_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{COMMISSION_SETTINGS_HINTS.discountMode}</p>
          </div>
        </div>
        <div className="p-4 pt-0 flex justify-end">
          <Button onClick={saveSalonSettings} disabled={isPending}>
            <Save size={16} />
            Salvar regras do salão
          </Button>
        </div>
      </section>

      {/* Comissão por item: padrão do salão ou exceção de um profissional */}
      <section className="bg-card border border-border rounded-md">
        <h3 className={sectionTitleClass}>Comissão por item</h3>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 md:max-w-sm">
            <label htmlFor="commission-scope" className={labelClass}>
              Configurar para
            </label>
            <select
              id="commission-scope"
              value={scope}
              disabled={isPending}
              onChange={(event) => setScope(event.target.value)}
              className={inputClass}
            >
              <option value="">Padrão do salão</option>
              {config.professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isActive ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </div>

          <p className="text-sm text-muted-foreground">
            {professional
              ? `Exceções de ${professional.name}. Item sem valor aqui segue o padrão do salão; sem padrão, vale o percentual geral dele (${percentLabel(professional.commissionRate)}, no cadastro em Equipe).`
              : "O que cada serviço ou produto paga de comissão para qualquer profissional. Item sem valor usa o percentual geral do cadastro de cada profissional."}
          </p>

          {professional && (
            <div className="rounded-md border border-border p-4 flex flex-col gap-4">
              <p className={labelClass}>Regras gerais de {professional.name}</p>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-date-basis" className="text-xs font-semibold text-muted-foreground">
                    Quando fica disponível
                  </label>
                  <select
                    id="override-date-basis"
                    value={override.dateBasis ?? ""}
                    disabled={isPending}
                    onChange={(event) =>
                      setOverride({ dateBasis: (event.target.value || null) as CommissionDateBasis | null })
                    }
                    className={inputClass}
                  >
                    <option value="">Seguir o salão</option>
                    {DATE_BASES.map((value) => (
                      <option key={value} value={value}>
                        {COMMISSION_DATE_BASIS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-fee-mode" className="text-xs font-semibold text-muted-foreground">
                    Taxas de pagamento
                  </label>
                  <select
                    id="override-fee-mode"
                    value={override.feeMode ?? ""}
                    disabled={isPending}
                    onChange={(event) => setOverride({ feeMode: (event.target.value || null) as CommissionShareMode | null })}
                    className={inputClass}
                  >
                    <option value="">Seguir o salão</option>
                    {FEE_MODES.map((value) => (
                      <option key={value} value={value}>
                        {COMMISSION_FEE_MODE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-discount-mode" className="text-xs font-semibold text-muted-foreground">
                    Descontos
                  </label>
                  <select
                    id="override-discount-mode"
                    value={override.discountMode ?? ""}
                    disabled={isPending}
                    onChange={(event) =>
                      setOverride({ discountMode: (event.target.value || null) as CommissionShareMode | null })
                    }
                    className={inputClass}
                  >
                    <option value="">Seguir o salão</option>
                    {DISCOUNT_MODES.map((value) => (
                      <option key={value} value={value}>
                        {COMMISSION_DISCOUNT_MODE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={saveOverride} disabled={isPending}>
                  <Save size={16} />
                  Salvar regras de {professional.name}
                </Button>
              </div>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum serviço ou produto ativo no salão.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs text-muted-foreground">
                    <th scope="col" className="p-3 text-left font-semibold">Item</th>
                    <th scope="col" className="p-3 text-left font-semibold w-24">Tipo</th>
                    <th scope="col" className="p-3 text-left font-semibold w-36">Comissão</th>
                    <th scope="col" className="p-3 text-left font-semibold">Sem valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => {
                    const draft = drafts[draftKey(scope, item.key)]
                    const fieldId = `rule-${item.key}`

                    return (
                      <tr key={item.key}>
                        <th scope="row" className="p-3 text-left font-normal text-foreground">
                          <label htmlFor={fieldId}>{item.name}</label>
                          {item.type === "product" && (
                            <span className="ml-2 text-[11px] font-semibold uppercase text-muted-foreground">Produto</span>
                          )}
                        </th>
                        <td className="p-2">
                          <select
                            aria-label={`Tipo de comissão de ${item.name}`}
                            value={draft?.kind ?? "percent"}
                            disabled={isPending}
                            onChange={(event) => setDraft(item.key, { kind: event.target.value as CommissionRateKind })}
                            className={inputClass}
                          >
                            {RATE_KINDS.map((kind) => (
                              <option key={kind} value={kind}>
                                {COMMISSION_RATE_KIND_LABELS[kind]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            id={fieldId}
                            type="text"
                            inputMode="decimal"
                            placeholder="—"
                            value={draft?.value ?? ""}
                            disabled={isPending}
                            onChange={(event) => setDraft(item.key, { value: event.target.value })}
                            className={inputClass}
                          />
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {draft && draft.value.trim() !== "" ? "" : fallbackHint(item)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {items.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={saveRules} disabled={isPending}>
                <Save size={16} />
                {professional ? `Salvar comissões de ${professional.name}` : "Salvar comissões por item"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Recalcular */}
      <section className="bg-card border border-border rounded-md">
        <h3 className={sectionTitleClass}>Recalcular período</h3>
        <div className="p-4 flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            A comissão é calculada quando a comanda é faturada e fica gravada: mudar uma regra não mexe no que já
            foi calculado. Recalcular aplica as regras de agora às comandas faturadas do período — use depois de
            corrigir uma regra, ou para calcular o que foi vendido antes de as comissões serem ligadas.
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recalc-from" className={labelClass}>
                De
              </label>
              <input
                id="recalc-from"
                type="date"
                value={recalcFrom}
                disabled={isPending}
                onChange={(event) => setRecalcFrom(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="recalc-to" className={labelClass}>
                Até
              </label>
              <input
                id="recalc-to"
                type="date"
                value={recalcTo}
                disabled={isPending}
                onChange={(event) => setRecalcTo(event.target.value)}
                className={inputClass}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setConfirmRecalc(true)}
              disabled={isPending || !recalcFrom || !recalcTo}
            >
              <RefreshCw size={16} />
              Recalcular
            </Button>
          </div>
        </div>
      </section>

      <ConfirmModal
        open={confirmRecalc}
        onClose={() => setConfirmRecalc(false)}
        onConfirm={runRecalculate}
        title="Recalcular comissões"
        description="As comissões das comandas faturadas do período serão refeitas com as regras de agora. Os valores do extrato podem mudar."
        confirmText="Recalcular"
        type="warning"
      />
    </div>
  )
}
