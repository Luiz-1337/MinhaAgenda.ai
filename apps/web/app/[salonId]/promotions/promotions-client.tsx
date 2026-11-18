"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, Plus, Tag, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deletePromotion, savePromotion } from "@/app/actions/promotions"
import {
  PROMOTION_APPLIES_LABELS,
  PROMOTION_STATUS_CLASSES,
  PROMOTION_STATUS_LABELS,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/constants/promotions.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { PromotionDTO, PromotionsDTO } from "@/lib/types/promotions"
import type { PromotionAppliesTo, PromotionDiscountKind } from "@repo/db"
import { describeCouponDiscount } from "@repo/db/src/domain/promotions"
import { Modal, formatCalendarDate, iconButtonClass, inputClass, labelClass } from "../inventory/inventory-ui"

type FormState = {
  promotion: PromotionDTO | null
  name: string
  code: string
  discountKind: PromotionDiscountKind
  discountValue: string
  appliesTo: PromotionAppliesTo
  startsOn: string
  endsOn: string
  weekdays: number[]
  isActive: boolean
}

function emptyForm(): FormState {
  return {
    promotion: null,
    name: "",
    code: "",
    discountKind: "percent",
    discountValue: "",
    appliesTo: "all",
    startsOn: "",
    endsOn: "",
    weekdays: [],
    isActive: true,
  }
}

/** "10.00" → "10,00" para o campo. */
function numberToInput(value: string): string {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "01/11/2026 a 30/11/2026", "a partir de…", "até…" ou "Sem prazo". */
function periodLabel(promotion: PromotionDTO): string {
  if (promotion.startsOn && promotion.endsOn) {
    return `${formatCalendarDate(promotion.startsOn)} a ${formatCalendarDate(promotion.endsOn)}`
  }
  if (promotion.startsOn) return `A partir de ${formatCalendarDate(promotion.startsOn)}`
  if (promotion.endsOn) return `Até ${formatCalendarDate(promotion.endsOn)}`
  return "Sem prazo"
}

function weekdaysLabel(weekdays: readonly number[]): string {
  return weekdays.length === 0 ? "Todos os dias" : weekdays.map((day) => WEEKDAY_SHORT_LABELS[day]).join(", ")
}

/**
 * Promoções e cupons (docs/ROADMAP.md, fase 6, fatia 6b): o desconto com código que
 * a recepção digita na comanda — "Nome, Cupom, Datas, Dias da semana, Status" na
 * Belasis.
 */
export function PromotionsClient({ salonId, data }: { salonId: string; data: PromotionsDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState<FormState | null>(null)
  const [toDelete, setToDelete] = useState<PromotionDTO | null>(null)

  function openEdit(promotion: PromotionDTO) {
    setForm({
      promotion,
      name: promotion.name,
      code: promotion.code,
      discountKind: promotion.discountKind,
      discountValue: numberToInput(promotion.discountValue),
      appliesTo: promotion.appliesTo,
      startsOn: promotion.startsOn ?? "",
      endsOn: promotion.endsOn ?? "",
      weekdays: promotion.weekdays,
      isActive: promotion.isActive,
    })
  }

  function update(change: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...change } : current))
  }

  function toggleWeekday(day: number) {
    setForm((current) =>
      current
        ? {
            ...current,
            weekdays: current.weekdays.includes(day)
              ? current.weekdays.filter((value) => value !== day)
              : [...current.weekdays, day].sort((a, b) => a - b),
          }
        : current
    )
  }

  function submit() {
    if (!form) return

    if (!form.name.trim()) {
      toast.error("Informe o nome da promoção")
      return
    }
    if (!form.code.trim()) {
      toast.error("Informe o cupom")
      return
    }
    const value = parseBRL(form.discountValue)
    if (value === null || value <= 0 || (form.discountKind === "percent" && value > 100)) {
      toast.error(form.discountKind === "percent" ? "O desconto percentual vai até 100" : "Informe o valor do desconto")
      return
    }
    if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
      toast.error("O fim da vigência é antes do começo")
      return
    }

    startTransition(async () => {
      const result = await savePromotion({
        salonId,
        promotionId: form.promotion?.id,
        name: form.name.trim(),
        code: form.code.trim(),
        discountKind: form.discountKind,
        discountValue: value,
        appliesTo: form.appliesTo,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
        weekdays: form.weekdays,
        isActive: form.isActive,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(form.promotion ? "Promoção salva" : "Promoção criada")
      setForm(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const promotion = toDelete
    if (!promotion) return
    startTransition(async () => {
      const result = await deletePromotion({ salonId, promotionId: promotion.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Promoção excluída")
      setToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Tag size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Promoções</h2>
            <p className="text-xs text-muted-foreground">
              Descontos com cupom, por período e por dia da semana. O cupom é digitado na comanda.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={() => setForm(emptyForm())} disabled={isPending}>
            <Plus size={16} />
            Nova promoção
          </Button>
        )}
      </div>

      <section className="bg-card border border-border rounded-md">
        {data.promotions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma promoção.{" "}
            {data.can.manage ? "Crie a primeira em “Nova promoção”." : "Quem gerencia promoções cria por aqui."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Promoção</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cupom</th>
                  <th scope="col" className="p-3 text-left font-semibold">Desconto</th>
                  <th scope="col" className="p-3 text-left font-semibold">Vigência</th>
                  <th scope="col" className="p-3 text-left font-semibold">Dias</th>
                  <th scope="col" className="p-3 text-right font-semibold">Usos</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.promotions.map((promotion) => (
                  <tr key={promotion.id} className={promotion.isActive ? "align-top" : "align-top opacity-60"}>
                    <th scope="row" className="p-3 text-left font-semibold text-foreground">
                      {promotion.name}
                    </th>
                    <td className="p-3 font-mono font-bold text-foreground">{promotion.code}</td>
                    <td className="p-3 text-muted-foreground">
                      {describeCouponDiscount(promotion)}
                      <span className="block text-[11px]">{PROMOTION_APPLIES_LABELS[promotion.appliesTo]}</span>
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">{periodLabel(promotion)}</td>
                    <td className="p-3 text-muted-foreground">{weekdaysLabel(promotion.weekdays)}</td>
                    <td className="p-3 text-right tabular-nums">
                      {promotion.invoiced}
                      {Number(promotion.discounted) > 0 && (
                        <span className="block text-[11px] text-muted-foreground">
                          {formatBRL(promotion.discounted)} em descontos
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${PROMOTION_STATUS_CLASSES[promotion.status]}`}
                      >
                        {PROMOTION_STATUS_LABELS[promotion.status]}
                      </span>
                    </td>
                    <td className="p-3">
                      {data.can.manage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(promotion)}
                            disabled={isPending}
                            aria-label={`Editar a promoção ${promotion.name}`}
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(promotion)}
                            disabled={isPending}
                            aria-label={`Excluir a promoção ${promotion.name}`}
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
          “Usos” conta as comandas faturadas com o cupom. O cupom vale pelo dia da comanda. O desconto dele soma ao
          desconto dado à mão em cada item; pacote, assinatura e sessão de pacote não recebem desconto de cupom.
        </p>
      </section>

      {form && (
        <Modal
          title={form.promotion ? `Promoção — ${form.promotion.name}` : "Nova promoção"}
          onClose={() => setForm(null)}
          disabled={isPending}
        >
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-name" className={labelClass}>
                  Nome
                </label>
                <input
                  id="promotion-name"
                  type="text"
                  placeholder="Ex.: Terça da escova"
                  value={form.name}
                  disabled={isPending}
                  onChange={(event) => update({ name: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-code" className={labelClass}>
                  Cupom
                </label>
                <input
                  id="promotion-code"
                  type="text"
                  placeholder="Ex.: ESCOVA10"
                  value={form.code}
                  disabled={isPending}
                  onChange={(event) => update({ code: event.target.value.toUpperCase() })}
                  className={`${inputClass} font-mono`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-kind" className={labelClass}>
                  Desconto
                </label>
                <select
                  id="promotion-kind"
                  value={form.discountKind}
                  disabled={isPending}
                  onChange={(event) => update({ discountKind: event.target.value as PromotionDiscountKind })}
                  className={inputClass}
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor fixo na comanda (R$)</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-value" className={labelClass}>
                  {form.discountKind === "percent" ? "Percentual" : "Valor"}
                </label>
                <input
                  id="promotion-value"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.discountValue}
                  disabled={isPending}
                  onChange={(event) => update({ discountValue: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="promotion-applies" className={labelClass}>
                Vale para
              </label>
              <select
                id="promotion-applies"
                value={form.appliesTo}
                disabled={isPending}
                onChange={(event) => update({ appliesTo: event.target.value as PromotionAppliesTo })}
                className={inputClass}
              >
                <option value="all">{PROMOTION_APPLIES_LABELS.all}</option>
                <option value="services">{PROMOTION_APPLIES_LABELS.services}</option>
                <option value="products">{PROMOTION_APPLIES_LABELS.products}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-starts" className={labelClass}>
                  Começa em (opcional)
                </label>
                <input
                  id="promotion-starts"
                  type="date"
                  value={form.startsOn}
                  disabled={isPending}
                  onChange={(event) => update({ startsOn: event.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="promotion-ends" className={labelClass}>
                  Termina em (opcional)
                </label>
                <input
                  id="promotion-ends"
                  type="date"
                  value={form.endsOn}
                  disabled={isPending}
                  onChange={(event) => update({ endsOn: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className={labelClass}>Dias da semana (nenhum marcado = todos)</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Dias da semana">
                {WEEKDAY_SHORT_LABELS.map((label, day) => {
                  const selected = form.weekdays.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      disabled={isPending}
                      onClick={() => toggleWeekday(day)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-colors ${
                        selected
                          ? "bg-foreground border-foreground text-background"
                          : "bg-card border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={isPending}
                onChange={(event) => update({ isActive: event.target.checked })}
              />
              Ativa (o cupom é aceito na comanda)
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
        title="Excluir promoção"
        description={
          toDelete && toDelete.sales > 0
            ? "Esta promoção já foi usada em comanda e não pode ser excluída. Desative-a em Editar para o cupom deixar de valer."
            : "A promoção sai da lista e o cupom deixa de valer. Promoção que já entrou em alguma comanda não pode ser excluída: desative-a. Esta ação não pode ser desfeita."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
