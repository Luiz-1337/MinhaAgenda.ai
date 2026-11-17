"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Repeat, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import {
  createCustomerSubscription,
  deleteCustomerSubscription,
  renewCustomerSubscription,
  searchSubscriptionCustomers,
  setCustomerSubscriptionActive,
} from "@/app/actions/subscriptions"
import {
  SUBSCRIPTION_STATUS_CLASSES as STATUS_CLASSES,
  SUBSCRIPTION_STATUS_LABELS as STATUS_LABELS,
  subscriptionIntervalLabel,
} from "@/lib/constants/subscriptions.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import type {
  CustomerSubscriptionDTO,
  CustomerSubscriptionsDTO,
  SubscriptionCustomerOption,
} from "@/lib/types/subscriptions"
import type { CustomerSubscriptionStatus } from "@repo/db"
import { Modal, formatCalendarDate, iconButtonClass, inputClass, labelClass } from "../../inventory/inventory-ui"
import { PackagesNav } from "../packages-ui"

type Filter = "all" | CustomerSubscriptionStatus

const linkButtonClass = "text-xs font-bold text-accent hover:underline disabled:opacity-50 disabled:no-underline"

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
 * Assinaturas de cliente (docs/ROADMAP.md, fase 5, fatia 5c): quem assina o quê,
 * até quando está pago e a situação. "Renovar" abre a comanda da cobrança.
 */
export function SubscriptionsClient({ salonId, data }: { salonId: string; data: CustomerSubscriptionsDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [filter, setFilter] = useState<Filter>("all")
  const [creating, setCreating] = useState(false)
  const [customer, setCustomer] = useState<SubscriptionCustomerOption | null>(null)
  const [planId, setPlanId] = useState("")
  const [toDeactivate, setToDeactivate] = useState<CustomerSubscriptionDTO | null>(null)
  const [toDelete, setToDelete] = useState<CustomerSubscriptionDTO | null>(null)

  const visible = useMemo(
    () => (filter === "all" ? data.subscriptions : data.subscriptions.filter((item) => item.status === filter)),
    [data.subscriptions, filter]
  )

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "pending", label: `Pendentes (${data.totals.pending})` },
    { key: "active", label: `Ativas (${data.totals.active})` },
    { key: "expired", label: `Expiradas (${data.totals.expired})` },
    { key: "inactive", label: `Desativadas (${data.totals.inactive})` },
  ]

  function openCreate() {
    setCustomer(null)
    setPlanId(data.plans[0]?.id ?? "")
    setCreating(true)
  }

  function submitCreate() {
    if (!customer) {
      toast.error("Selecione o cliente")
      return
    }
    if (!planId) {
      toast.error("Selecione o plano")
      return
    }
    startTransition(async () => {
      const result = await createCustomerSubscription({ salonId, customerId: customer.id, planId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Assinatura criada. Use “Cobrar” para abrir a comanda")
      setCreating(false)
      router.refresh()
    })
  }

  /** Abre a comanda da cobrança, já no faturamento. */
  function renew(subscription: CustomerSubscriptionDTO) {
    startTransition(async () => {
      const result = await renewCustomerSubscription({ salonId, subscriptionId: subscription.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      const saleId = result.data?.saleId
      if (!saleId) return
      if (result.data?.existing) toast.message("Esta assinatura já tem uma comanda aberta")
      router.push(`/${salonId}/sales/${saleId}?invoice=1`)
    })
  }

  function setActive(subscription: CustomerSubscriptionDTO, active: boolean) {
    startTransition(async () => {
      const result = await setCustomerSubscriptionActive({ salonId, subscriptionId: subscription.id, active })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(active ? "Assinatura reativada" : "Assinatura desativada")
      setToDeactivate(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const subscription = toDelete
    if (!subscription) return
    startTransition(async () => {
      const result = await deleteCustomerSubscription({ salonId, subscriptionId: subscription.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Assinatura excluída")
      setToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Repeat size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Assinaturas</h2>
            <p className="text-xs text-muted-foreground">
              Quem assina, até quando está pago e a situação. Renovar abre a comanda da cobrança; a assinatura fica
              ativa quando a comanda é faturada.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={openCreate} disabled={isPending}>
            <Plus size={16} />
            Nova assinatura
          </Button>
        )}
      </div>

      <PackagesNav salonId={salonId} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Pendentes" value={String(data.totals.pending)} hint="Ainda não foram pagas" />
        <Stat label="Ativas" value={String(data.totals.active)} hint="Pagas até hoje ou depois" />
        <Stat label="Expiradas" value={String(data.totals.expired)} hint="O último período venceu" />
        <Stat label="Desativadas" value={String(data.totals.inactive)} hint="Encerradas pelo salão" />
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assinaturas</h3>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar assinaturas">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                  filter === item.key
                    ? "bg-foreground border-foreground text-background"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.subscriptions.length === 0 ? "Nenhuma assinatura." : "Nenhuma assinatura nesta situação."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Plano</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Desde</th>
                  <th scope="col" className="p-3 text-left font-semibold">Vencimento</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((subscription) => (
                  <tr key={subscription.id} className="align-top">
                    <td className="p-3 font-semibold text-foreground">{subscription.customerName}</td>
                    <td className="p-3 text-foreground">
                      {subscription.name}
                      <span className="block text-[11px] text-muted-foreground">
                        {subscriptionIntervalLabel(subscription.intervalMonths)}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatBRL(subscription.price)}</td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {formatCalendarDate(subscription.startedOn)}
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {subscription.paidUntil ? formatCalendarDate(subscription.paidUntil) : "—"}
                      {subscription.lastSale && (
                        <Link
                          href={`/${salonId}/sales/${subscription.lastSale.saleId}`}
                          className="block text-[11px] text-accent hover:underline"
                        >
                          Comanda #{subscription.lastSale.number}
                          {subscription.periods > 1 ? ` · ${subscription.periods} cobranças` : ""}
                        </Link>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_CLASSES[subscription.status]}`}
                      >
                        {STATUS_LABELS[subscription.status]}
                      </span>
                      {subscription.openSale && (
                        <Link
                          href={`/${salonId}/sales/${subscription.openSale.saleId}`}
                          className="block mt-1 text-[11px] text-accent hover:underline"
                        >
                          Cobrança aberta na comanda #{subscription.openSale.number}
                        </Link>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {data.can.charge && subscription.status !== "inactive" && (
                          <button
                            type="button"
                            onClick={() => renew(subscription)}
                            disabled={isPending}
                            className={linkButtonClass}
                          >
                            {subscription.periods === 0 ? "Cobrar" : "Renovar"}
                          </button>
                        )}
                        {data.can.manage &&
                          (subscription.status === "inactive" ? (
                            <button
                              type="button"
                              onClick={() => setActive(subscription, true)}
                              disabled={isPending}
                              className={linkButtonClass}
                            >
                              Reativar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setToDeactivate(subscription)}
                              disabled={isPending}
                              className="text-xs font-bold text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              Desativar
                            </button>
                          ))}
                        {data.can.manage && subscription.periods === 0 && (
                          <button
                            type="button"
                            onClick={() => setToDelete(subscription)}
                            disabled={isPending}
                            aria-label={`Excluir a assinatura de ${subscription.customerName}`}
                            className={iconButtonClass}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.truncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando as {data.subscriptions.length} assinaturas mais recentes.
          </p>
        )}
      </section>

      {creating && (
        <Modal title="Nova assinatura" onClose={() => setCreating(false)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className={labelClass}>Cliente</span>
              <CustomerPicker salonId={salonId} customer={customer} disabled={isPending} onChange={setCustomer} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="subscription-plan" className={labelClass}>
                Plano
              </label>
              {data.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum plano ativo.{" "}
                  <Link
                    href={`/${salonId}/packages/subscription-plans`}
                    className="font-semibold text-accent hover:underline"
                  >
                    Crie um plano
                  </Link>{" "}
                  primeiro.
                </p>
              ) : (
                <select
                  id="subscription-plan"
                  value={planId}
                  disabled={isPending}
                  onChange={(event) => setPlanId(event.target.value)}
                  className={inputClass}
                >
                  {data.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {formatBRL(plan.price)} · {subscriptionIntervalLabel(plan.intervalMonths)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              A assinatura nasce pendente. Ela fica ativa quando a primeira cobrança é faturada.
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={isPending || data.plans.length === 0}>
              Criar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={toDeactivate !== null}
        onClose={() => setToDeactivate(null)}
        onConfirm={() => toDeactivate && setActive(toDeactivate, false)}
        title="Desativar assinatura"
        description="A assinatura deixa de aceitar cobrança. O que já foi pago continua no histórico, e ela pode ser reativada depois. Uma comanda aberta com a cobrança dela não poderá ser faturada."
        confirmText="Desativar"
        type="warning"
      />

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir assinatura"
        description="A assinatura sai da lista. Só dá para excluir a que nunca foi cobrada e não está em nenhuma comanda; as outras se desativam. Esta ação não pode ser desfeita."
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}

// ============================================================================
// Seletor de cliente
// ============================================================================

function CustomerPicker({
  salonId,
  customer,
  disabled,
  onChange,
}: {
  salonId: string
  customer: SubscriptionCustomerOption | null
  disabled: boolean
  onChange: (customer: SubscriptionCustomerOption | null) => void
}) {
  const [term, setTerm] = useState("")
  // O resultado guarda PARA QUAL termo ele vale: "buscando" e "lista vazia" saem
  // dessa comparação, sem estado extra para manter em sincronia.
  const [found, setFound] = useState<{ term: string; results: SubscriptionCustomerOption[] }>({
    term: "",
    results: [],
  })

  const cleaned = term.trim()
  const searching = cleaned.length >= 2 && found.term !== cleaned
  const results = found.term === cleaned ? found.results : []

  useEffect(() => {
    if (cleaned.length < 2) return

    // Espera a pessoa parar de digitar; e descarta a resposta de uma busca antiga
    // que chegue depois de uma mais nova.
    let cancelled = false
    const timer = setTimeout(async () => {
      const response = await searchSubscriptionCustomers(salonId, cleaned)
      if (cancelled) return
      if ("error" in response) {
        toast.error(response.error)
        setFound({ term: cleaned, results: [] })
        return
      }
      setFound({ term: cleaned, results: response })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cleaned, salonId])

  if (customer) {
    return (
      <div className="flex items-center justify-between gap-3 bg-muted/50 border border-border rounded-md px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{customer.name}</p>
          <p className="text-xs text-muted-foreground">{customer.phone}</p>
        </div>
        {!disabled && (
          <button onClick={() => onChange(null)} className="text-xs font-bold text-accent hover:underline flex-shrink-0">
            Trocar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
        <input
          type="text"
          value={term}
          disabled={disabled}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por nome ou telefone"
          aria-label="Buscar cliente por nome ou telefone"
          className={`${inputClass} pl-9`}
        />
      </div>
      {cleaned.length >= 2 && (
        <div
          className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto"
          role="listbox"
          aria-label="Clientes encontrados"
        >
          {searching ? (
            <p className="p-3 text-xs text-muted-foreground">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>
          ) : (
            results.map((option) => (
              <button
                key={option.id}
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(option)
                  setTerm("")
                }}
                className="w-full text-left p-3 hover:bg-muted transition-colors"
              >
                <span className="block text-sm font-semibold text-foreground">{option.name}</span>
                <span className="block text-xs text-muted-foreground">{option.phone}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
