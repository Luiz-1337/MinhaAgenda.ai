"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deleteSubscriptionPlan, saveSubscriptionPlan } from "@/app/actions/subscriptions"
import { SUBSCRIPTION_INTERVAL_OPTIONS, subscriptionIntervalLabel } from "@/lib/constants/subscriptions.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { SubscriptionPlanDTO, SubscriptionPlansDTO } from "@/lib/types/subscriptions"
import { Modal, iconButtonClass, inputClass, labelClass } from "../../inventory/inventory-ui"
import { PackagesNav } from "../packages-ui"

type FormState = {
  plan: SubscriptionPlanDTO | null
  name: string
  description: string
  price: string
  intervalMonths: number
  isActive: boolean
  isVisible: boolean
}

function emptyForm(): FormState {
  return { plan: null, name: "", description: "", price: "", intervalMonths: 1, isActive: true, isVisible: false }
}

/** "120.00" → "120,00" para o campo. */
function moneyToInput(value: string): string {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Planos de assinatura (docs/ROADMAP.md, fase 5, fatia 5c): o modelo que o cliente
 * assina ("Clube mensal por R$ 120").
 */
export function SubscriptionPlansClient({ salonId, data }: { salonId: string; data: SubscriptionPlansDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState<FormState | null>(null)
  const [toDelete, setToDelete] = useState<SubscriptionPlanDTO | null>(null)

  function openEdit(plan: SubscriptionPlanDTO) {
    setForm({
      plan,
      name: plan.name,
      description: plan.description ?? "",
      price: moneyToInput(plan.price),
      intervalMonths: plan.intervalMonths,
      isActive: plan.isActive,
      isVisible: plan.isVisible,
    })
  }

  function update(change: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...change } : current))
  }

  // Periodicidade gravada fora da lista (ex.: 5 meses) continua aparecendo.
  const intervalOptions =
    form && !SUBSCRIPTION_INTERVAL_OPTIONS.some((option) => option.months === form.intervalMonths)
      ? [
          ...SUBSCRIPTION_INTERVAL_OPTIONS,
          { months: form.intervalMonths, label: subscriptionIntervalLabel(form.intervalMonths) },
        ]
      : SUBSCRIPTION_INTERVAL_OPTIONS

  function submit() {
    if (!form) return

    if (!form.name.trim()) {
      toast.error("Informe o nome do plano")
      return
    }
    const price = parseBRL(form.price)
    if (price === null || price <= 0) {
      toast.error("Informe o valor do plano")
      return
    }

    startTransition(async () => {
      const result = await saveSubscriptionPlan({
        salonId,
        planId: form.plan?.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price,
        intervalMonths: form.intervalMonths,
        isActive: form.isActive,
        isVisible: form.isVisible,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(form.plan ? "Plano salvo" : "Plano criado")
      setForm(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const plan = toDelete
    if (!plan) return
    startTransition(async () => {
      const result = await deleteSubscriptionPlan({ salonId, planId: plan.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Plano excluído")
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
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Planos de assinatura</h2>
            <p className="text-xs text-muted-foreground">
              O que o cliente assina: quanto custa e de quanto em quanto tempo se cobra.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={() => setForm(emptyForm())} disabled={isPending}>
            <Plus size={16} />
            Novo plano
          </Button>
        )}
      </div>

      <PackagesNav salonId={salonId} />

      <section className="bg-card border border-border rounded-md">
        {data.plans.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum plano de assinatura.{" "}
            {data.can.manage ? "Crie o primeiro em “Novo plano”." : "Quem gerencia pacotes cria por aqui."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Plano</th>
                  <th scope="col" className="p-3 text-left font-semibold">Periodicidade</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-right font-semibold">Assinantes</th>
                  <th scope="col" className="p-3 text-left font-semibold">Visível</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.plans.map((plan) => (
                  <tr key={plan.id} className={plan.isActive ? "align-top" : "align-top opacity-60"}>
                    <td className="p-3 font-semibold text-foreground">
                      {plan.name}
                      {!plan.isActive && (
                        <span className="block text-[11px] font-normal text-muted-foreground">inativo</span>
                      )}
                      {plan.description && (
                        <span className="block text-[11px] font-normal text-muted-foreground">{plan.description}</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{subscriptionIntervalLabel(plan.intervalMonths)}</td>
                    <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                      {formatBRL(plan.price)}
                    </td>
                    <td className="p-3 text-right tabular-nums">{plan.subscribers}</td>
                    <td className="p-3 text-muted-foreground">{plan.isVisible ? "Sim" : "Não"}</td>
                    <td className="p-3">
                      {data.can.manage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(plan)}
                            disabled={isPending}
                            aria-label={`Editar o plano ${plan.name}`}
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(plan)}
                            disabled={isPending}
                            aria-label={`Excluir o plano ${plan.name}`}
                            className={iconButtonClass}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          A assinatura do cliente copia o nome, o valor e a periodicidade do plano no dia em que é criada: mudar o
          plano aqui depois não muda quem já assina. “Visível” marca o plano para a página pública de planos, que
          ainda não existe.
        </p>
      </section>

      {form && (
        <Modal
          title={form.plan ? `Plano — ${form.plan.name}` : "Novo plano"}
          onClose={() => setForm(null)}
          disabled={isPending}
        >
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-name" className={labelClass}>
                Nome
              </label>
              <input
                id="plan-name"
                type="text"
                placeholder="Ex.: Clube de escova"
                value={form.name}
                disabled={isPending}
                onChange={(event) => update({ name: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="plan-description" className={labelClass}>
                Descrição (opcional)
              </label>
              <input
                id="plan-description"
                type="text"
                value={form.description}
                disabled={isPending}
                onChange={(event) => update({ description: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-price" className={labelClass}>
                  Valor
                </label>
                <input
                  id="plan-price"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.price}
                  disabled={isPending}
                  onChange={(event) => update({ price: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="plan-interval" className={labelClass}>
                  Periodicidade
                </label>
                <select
                  id="plan-interval"
                  value={form.intervalMonths}
                  disabled={isPending}
                  onChange={(event) => update({ intervalMonths: Number(event.target.value) })}
                  className={inputClass}
                >
                  {intervalOptions.map((option) => (
                    <option key={option.months} value={option.months}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={isPending}
                onChange={(event) => update({ isActive: event.target.checked })}
              />
              Ativo (aceita assinatura nova)
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isVisible}
                disabled={isPending}
                onChange={(event) => update({ isVisible: event.target.checked })}
              />
              Visível na página pública de planos
            </label>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setForm(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir plano"
        description={
          toDelete && toDelete.subscriptions > 0
            ? "Este plano já tem assinatura e não pode ser excluído. Desative-o em Editar para que não aceite assinatura nova."
            : "O plano sai da lista. Plano que já teve assinatura não pode ser excluído: desative-o. Esta ação não pode ser desfeita."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
