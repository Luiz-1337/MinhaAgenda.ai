"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Coins, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveCashbackRule, saveCashbackSettings } from "@/app/actions/cashback"
import { CASHBACK_STATUS_CLASSES, CASHBACK_STATUS_LABELS } from "@/lib/constants/cashback.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { CashbackItemDTO, CashbackOverviewDTO } from "@/lib/types/cashback"
import type { CashbackRateKind } from "@repo/db"
import { Modal, iconButtonClass, inputClass, labelClass } from "../inventory/inventory-ui"

type Tab = "customers" | "items" | "settings"

type RuleForm = { item: CashbackItemDTO; kind: CashbackRateKind; value: string; isActive: boolean }

/** "5.00" → "5,00" para o campo. */
function numberToInput(value: string): string {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "5.00" + percent → "5%"; fixed → "R$ 5,00". */
function rateLabel(kind: CashbackRateKind, value: string): string {
  return kind === "percent" ? `${Number(value).toLocaleString("pt-BR")}%` : `${formatBRL(value)} por unidade`
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

/**
 * Cashback (docs/ROADMAP.md, fase 6, fatia 6a): os clientes com saldo, quanto cada
 * serviço e produto rende e a configuração do salão.
 */
export function CashbackClient({ salonId, data }: { salonId: string; data: CashbackOverviewDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [tab, setTab] = useState<Tab>("customers")
  const [ruleForm, setRuleForm] = useState<RuleForm | null>(null)

  const [isEnabled, setIsEnabled] = useState(data.settings.isEnabled)
  const [defaultKind, setDefaultKind] = useState<CashbackRateKind>(data.settings.defaultKind)
  const [defaultValue, setDefaultValue] = useState(numberToInput(data.settings.defaultValue))
  const [minRedeem, setMinRedeem] = useState(numberToInput(data.settings.minRedeem))

  const totalBalance = data.customers.reduce((sum, customer) => sum + Math.max(0, Number(customer.balance)), 0)
  const available = data.customers.filter((customer) => customer.status === "available").length
  const hasDefault = Number(data.settings.defaultValue) > 0

  const tabs: { key: Tab; label: string }[] = [
    { key: "customers", label: `Clientes (${data.customers.length})` },
    { key: "items", label: "Serviços e produtos" },
    { key: "settings", label: "Configurações" },
  ]

  function submitSettings() {
    const value = defaultValue.trim() === "" ? 0 : parseBRL(defaultValue)
    if (value === null || value < 0 || (defaultKind === "percent" && value > 100)) {
      toast.error(defaultKind === "percent" ? "O percentual vai de 0 a 100" : "Valor padrão inválido")
      return
    }
    const minimum = minRedeem.trim() === "" ? 0 : parseBRL(minRedeem)
    if (minimum === null || minimum < 0) {
      toast.error("Valor mínimo para resgate inválido")
      return
    }

    startTransition(async () => {
      const result = await saveCashbackSettings({
        salonId,
        isEnabled,
        defaultKind,
        defaultValue: value,
        minRedeem: minimum,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Configurações salvas")
      router.refresh()
    })
  }

  function openRule(item: CashbackItemDTO) {
    setRuleForm({
      item,
      kind: item.rule?.kind ?? data.settings.defaultKind,
      value: item.rule && Number(item.rule.value) > 0 ? numberToInput(item.rule.value) : "",
      isActive: item.rule?.isActive ?? true,
    })
  }

  function submitRule() {
    if (!ruleForm) return
    const value = ruleForm.value.trim() === "" ? 0 : parseBRL(ruleForm.value)
    if (value === null || value < 0 || (ruleForm.kind === "percent" && value > 100)) {
      toast.error(ruleForm.kind === "percent" ? "O percentual vai de 0 a 100" : "Valor de cashback inválido")
      return
    }

    startTransition(async () => {
      const result = await saveCashbackRule({
        salonId,
        itemKind: ruleForm.item.itemKind,
        itemId: ruleForm.item.id,
        kind: ruleForm.kind,
        value,
        isActive: ruleForm.isActive,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Cashback do item salvo")
      setRuleForm(null)
      router.refresh()
    })
  }

  /** O que o item rende hoje, em palavras. */
  function itemRate(item: CashbackItemDTO): string {
    if (item.rule && !item.rule.isActive) return "Não dá cashback"
    if (item.rule && Number(item.rule.value) > 0) return rateLabel(item.rule.kind, item.rule.value)
    return hasDefault
      ? `Padrão (${rateLabel(data.settings.defaultKind, data.settings.defaultValue)})`
      : "Padrão (sem valor definido)"
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Coins size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Cashback</h2>
          <p className="text-xs text-muted-foreground">
            O cliente ganha crédito quando a comanda é faturada e usa esse crédito para pagar uma próxima.
          </p>
        </div>
      </div>

      {!data.settings.isEnabled && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          O cashback está desativado: as comandas não geram crédito e o saldo dos clientes não pode ser usado. Ative
          em Configurações.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Saldo dos clientes" value={formatBRL(totalBalance)} hint="Crédito ainda não usado" />
        <Stat label="Podem resgatar" value={String(available)} hint="Clientes com saldo no mínimo ou acima" />
        <Stat
          label="Valor padrão"
          value={hasDefault ? rateLabel(data.settings.defaultKind, data.settings.defaultValue) : "—"}
          hint={`Mínimo para resgate: ${formatBRL(data.settings.minRedeem)}`}
        />
      </div>

      <nav aria-label="Telas de cashback" className="flex flex-wrap items-center gap-2 flex-shrink-0">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
              tab === item.key
                ? "bg-foreground border-foreground text-background"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
        <Link
          href={`/${salonId}/cashback/history`}
          className="px-3 py-1.5 rounded-md border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          Histórico
        </Link>
      </nav>

      {tab === "customers" && (
        <section className="bg-card border border-border rounded-md">
          {data.customers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum cliente com movimento de cashback.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                    <th scope="col" className="p-3 text-right font-semibold">Ganhou</th>
                    <th scope="col" className="p-3 text-right font-semibold">Usou</th>
                    <th scope="col" className="p-3 text-right font-semibold">Saldo</th>
                    <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.customers.map((customer) => (
                    <tr key={customer.customerId}>
                      <th scope="row" className="p-3 text-left font-semibold">
                        <Link
                          href={`/${salonId}/contacts/${customer.customerId}`}
                          className="text-foreground hover:text-accent hover:underline"
                        >
                          {customer.customerName}
                        </Link>
                      </th>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatBRL(customer.earned)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {formatBRL(customer.redeemed)}
                      </td>
                      <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                        {formatBRL(customer.balance)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${CASHBACK_STATUS_CLASSES[customer.status]}`}
                        >
                          {CASHBACK_STATUS_LABELS[customer.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            O extrato de cada cliente, e o ajuste manual do saldo, ficam na ficha dele.
            {data.truncated ? ` Mostrando os ${data.customers.length} maiores saldos.` : ""}
          </p>
        </section>
      )}

      {tab === "items" && (
        <section className="bg-card border border-border rounded-md">
          {data.items.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum serviço ou produto ativo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th scope="col" className="p-3 text-left font-semibold">Item</th>
                    <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                    <th scope="col" className="p-3 text-left font-semibold">Cashback</th>
                    <th scope="col" className="p-3 w-16"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.items.map((item) => (
                    <tr
                      key={`${item.itemKind}:${item.id}`}
                      className={item.rule && !item.rule.isActive ? "opacity-60" : undefined}
                    >
                      <th scope="row" className="p-3 text-left font-semibold text-foreground">
                        {item.name}
                      </th>
                      <td className="p-3 text-muted-foreground">
                        {item.itemKind === "service" ? "Serviço" : "Produto"}
                      </td>
                      <td className="p-3 text-muted-foreground">{itemRate(item)}</td>
                      <td className="p-3">
                        {data.can.manage && (
                          <button
                            type="button"
                            onClick={() => openRule(item)}
                            disabled={isPending}
                            aria-label={`Editar o cashback de ${item.name}`}
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Sem valor próprio, o item usa o padrão do salão. Pacote e assinatura não geram cashback, e a sessão que
            sai de um pacote também não.
          </p>
        </section>
      )}

      {tab === "settings" && (
        <section className="bg-card border border-border rounded-md p-4 flex flex-col gap-4 max-w-xl">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={isEnabled}
              disabled={isPending || !data.can.manage}
              onChange={(event) => setIsEnabled(event.target.checked)}
            />
            Cashback ativo (as comandas geram crédito e aceitam o saldo do cliente)
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="cashback-default-kind" className={labelClass}>
                Valor padrão
              </label>
              <select
                id="cashback-default-kind"
                value={defaultKind}
                disabled={isPending || !data.can.manage}
                onChange={(event) => setDefaultKind(event.target.value as CashbackRateKind)}
                className={inputClass}
              >
                <option value="percent">Percentual do item (%)</option>
                <option value="fixed">Valor fixo por unidade (R$)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cashback-default-value" className={labelClass}>
                {defaultKind === "percent" ? "Percentual" : "Valor"}
              </label>
              <input
                id="cashback-default-value"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={defaultValue}
                disabled={isPending || !data.can.manage}
                onChange={(event) => setDefaultValue(event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 max-w-[calc(50%-0.375rem)]">
            <label htmlFor="cashback-min-redeem" className={labelClass}>
              Valor mínimo para resgate (R$)
            </label>
            <input
              id="cashback-min-redeem"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={minRedeem}
              disabled={isPending || !data.can.manage}
              onChange={(event) => setMinRedeem(event.target.value)}
              className={inputClass}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            O cliente só usa o cashback quando o saldo dele alcança o mínimo. A parte da comanda paga com cashback não
            gera cashback novo. Desativar não apaga o saldo de ninguém: só para de gerar e de aceitar.
          </p>

          {data.can.manage && (
            <div>
              <Button onClick={submitSettings} disabled={isPending}>
                Salvar
              </Button>
            </div>
          )}
        </section>
      )}

      {ruleForm && (
        <Modal title={`Cashback — ${ruleForm.item.name}`} onClose={() => setRuleForm(null)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="cashback-rule-kind" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="cashback-rule-kind"
                  value={ruleForm.kind}
                  disabled={isPending}
                  onChange={(event) => setRuleForm({ ...ruleForm, kind: event.target.value as CashbackRateKind })}
                  className={inputClass}
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor fixo por unidade (R$)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="cashback-rule-value" className={labelClass}>
                  Valor de cashback
                </label>
                <input
                  id="cashback-rule-value"
                  type="text"
                  inputMode="decimal"
                  placeholder="Padrão do salão"
                  value={ruleForm.value}
                  disabled={isPending}
                  onChange={(event) => setRuleForm({ ...ruleForm, value: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={ruleForm.isActive}
                disabled={isPending}
                onChange={(event) => setRuleForm({ ...ruleForm, isActive: event.target.checked })}
              />
              Ativo (este item dá cashback)
            </label>
            <p className="text-xs text-muted-foreground">
              Em branco ou zero, o item usa o valor padrão do salão. Desmarcado, não dá cashback nenhum.
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setRuleForm(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitRule} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
