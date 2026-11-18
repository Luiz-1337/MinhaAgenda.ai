"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Gift, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deletePackageTemplate, savePackageTemplate } from "@/app/actions/packages"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { PackageTemplateDTO, PackageTemplatesDTO, SavePackageTemplateInput } from "@/lib/types/packages"
import { Modal, iconButtonClass, inputClass, labelClass } from "../../inventory/inventory-ui"
import { PackagesNav, validityLabel } from "../packages-ui"

type LineDraft = { key: number; kind: "service" | "product"; refId: string; quantity: string }

type FormState = {
  template: PackageTemplateDTO | null
  name: string
  description: string
  price: string
  validityDays: string
  isActive: boolean
  lines: LineDraft[]
}

function emptyForm(): FormState {
  return { template: null, name: "", description: "", price: "", validityDays: "", isActive: true, lines: [] }
}

/** "900.00" → "900,00" para o campo. */
function moneyToInput(value: string): string {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Pacotes predefinidos (docs/ROADMAP.md, fase 5, fatia 5a): o modelo que a comanda
 * vende ("5 sessões de laser por R$ 900, vale 6 meses").
 */
export function TemplatesClient({ salonId, data }: { salonId: string; data: PackageTemplatesDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState<FormState | null>(null)
  const [nextKey, setNextKey] = useState(0)
  const [toDelete, setToDelete] = useState<PackageTemplateDTO | null>(null)

  // Serviço ou produto desativado que já estava no pacote continua aparecendo.
  function optionsFor(kind: "service" | "product", line: LineDraft) {
    const base = kind === "service" ? data.catalog.services : data.catalog.products
    if (!line.refId || base.some((option) => option.id === line.refId)) return base
    const saved = form?.template?.items.find(
      (item) => (kind === "service" ? item.serviceId : item.productId) === line.refId
    )
    return [...base, { id: line.refId, name: saved?.description ?? "Inativo" }]
  }

  function openNew() {
    setForm(emptyForm())
  }

  function openEdit(template: PackageTemplateDTO) {
    setForm({
      template,
      name: template.name,
      description: template.description ?? "",
      price: moneyToInput(template.price),
      validityDays: template.validityDays === null ? "" : String(template.validityDays),
      isActive: template.isActive,
      lines: template.items.map((item, index) => ({
        key: index,
        kind: item.kind,
        refId: (item.kind === "service" ? item.serviceId : item.productId) ?? "",
        quantity: String(item.quantity),
      })),
    })
    setNextKey(template.items.length)
  }

  function update(change: Partial<FormState>) {
    setForm((current) => (current ? { ...current, ...change } : current))
  }

  function addLine(kind: "service" | "product") {
    setForm((current) =>
      current ? { ...current, lines: [...current.lines, { key: nextKey, kind, refId: "", quantity: "1" }] } : current
    )
    setNextKey((key) => key + 1)
  }

  function updateLine(key: number, change: Partial<LineDraft>) {
    setForm((current) =>
      current
        ? { ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...change } : line)) }
        : current
    )
  }

  function removeLine(key: number) {
    setForm((current) => (current ? { ...current, lines: current.lines.filter((line) => line.key !== key) } : current))
  }

  function submit() {
    if (!form) return

    if (!form.name.trim()) {
      toast.error("Informe o nome do pacote")
      return
    }

    const price = form.price.trim() === "" ? 0 : parseBRL(form.price)
    if (price === null || price < 0) {
      toast.error("Valor do pacote inválido")
      return
    }

    let validityDays: number | null = null
    if (form.validityDays.trim() !== "") {
      const days = Number(form.validityDays.trim())
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        toast.error("A validade vai de 1 a 3650 dias")
        return
      }
      validityDays = days
    }

    if (form.lines.length === 0) {
      toast.error("O pacote precisa de pelo menos um item")
      return
    }

    const items: SavePackageTemplateInput["items"] = []
    for (const [index, line] of form.lines.entries()) {
      const label = `Item ${index + 1}`
      if (!line.refId) {
        toast.error(`${label}: escolha o ${line.kind === "service" ? "serviço" : "produto"}`)
        return
      }
      const quantity = Number(line.quantity.trim())
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
        toast.error(`${label}: a quantidade vai de 1 a 999`)
        return
      }
      items.push({
        kind: line.kind,
        serviceId: line.kind === "service" ? line.refId : null,
        productId: line.kind === "product" ? line.refId : null,
        quantity,
      })
    }

    const input: SavePackageTemplateInput = {
      salonId,
      templateId: form.template?.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price,
      validityDays,
      isActive: form.isActive,
      items,
    }

    startTransition(async () => {
      const result = await savePackageTemplate(input)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(form.template ? "Pacote salvo" : "Pacote criado")
      setForm(null)
      router.refresh()
    })
  }

  function confirmDelete() {
    const template = toDelete
    if (!template) return
    startTransition(async () => {
      const result = await deletePackageTemplate({ salonId, templateId: template.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Pacote excluído")
      setToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Gift size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Pacotes predefinidos</h2>
            <p className="text-xs text-muted-foreground">
              O que cada pacote inclui, quanto custa e por quanto tempo vale. Vende-se pela comanda.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={openNew} disabled={isPending}>
            <Plus size={16} />
            Novo pacote
          </Button>
        )}
      </div>

      <PackagesNav salonId={salonId} />

      <section className="bg-card border border-border rounded-md">
        {data.templates.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum pacote predefinido.{" "}
            {data.can.manage ? "Crie o primeiro em “Novo pacote”." : "Quem gerencia pacotes cria por aqui."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Pacote</th>
                  <th scope="col" className="p-3 text-left font-semibold">Inclui</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Validade</th>
                  <th scope="col" className="p-3 text-right font-semibold">Vendidos</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.templates.map((template) => (
                  <tr key={template.id} className={template.isActive ? "align-top" : "align-top opacity-60"}>
                    <td className="p-3 font-semibold text-foreground">
                      {template.name}
                      {!template.isActive && (
                        <span className="block text-[11px] font-normal text-muted-foreground">inativo</span>
                      )}
                      {template.description && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {template.description}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      <ul className="flex flex-col gap-0.5">
                        {template.items.map((item) => (
                          <li key={`${item.kind}:${item.serviceId ?? item.productId}`}>
                            {item.quantity} × {item.description}
                            {item.kind === "product" && <span className="text-[11px]"> (produto)</span>}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 text-right tabular-nums font-semibold text-foreground">
                      {formatBRL(template.price)}
                    </td>
                    <td className="p-3 text-muted-foreground">{validityLabel(template.validityDays)}</td>
                    <td className="p-3 text-right tabular-nums">{template.sold}</td>
                    <td className="p-3">
                      {data.can.manage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(template)}
                            disabled={isPending}
                            aria-label={`Editar o pacote ${template.name}`}
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setToDelete(template)}
                            disabled={isPending}
                            aria-label={`Excluir o pacote ${template.name}`}
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
          Para vender, abra uma{" "}
          <Link href={`/${salonId}/sales/new`} className="font-semibold text-accent hover:underline">
            comanda
          </Link>{" "}
          e use “+ Pacote”. Quando a comanda é faturada, o pacote passa a ser do cliente, com os itens e a validade de
          hoje: mudar o pacote aqui depois não muda o que já foi vendido.
        </p>
      </section>

      {form && (
        <Modal
          title={form.template ? `Pacote — ${form.template.name}` : "Novo pacote"}
          onClose={() => setForm(null)}
          disabled={isPending}
        >
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1">
              <label htmlFor="package-name" className={labelClass}>
                Nome
              </label>
              <input
                id="package-name"
                type="text"
                placeholder="Ex.: 5 sessões de hidratação"
                value={form.name}
                disabled={isPending}
                onChange={(event) => update({ name: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="package-description" className={labelClass}>
                Descrição (opcional)
              </label>
              <input
                id="package-description"
                type="text"
                value={form.description}
                disabled={isPending}
                onChange={(event) => update({ description: event.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="package-price" className={labelClass}>
                  Valor
                </label>
                <input
                  id="package-price"
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
                <label htmlFor="package-validity" className={labelClass}>
                  Validade em dias (opcional)
                </label>
                <input
                  id="package-validity"
                  type="text"
                  inputMode="numeric"
                  placeholder="Não vence"
                  value={form.validityDays}
                  disabled={isPending}
                  onChange={(event) => update({ validityDays: event.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={isPending}
                onChange={(event) => update({ isActive: event.target.checked })}
              />
              Ativo (aparece na comanda)
            </label>

            <p className={labelClass}>O que o pacote inclui</p>
            {form.lines.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item.</p>}
            {form.lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="flex flex-col gap-1 col-span-8">
                  <label htmlFor={`package-item-${line.key}`} className={labelClass}>
                    {line.kind === "service" ? "Serviço" : "Produto"}
                  </label>
                  <select
                    id={`package-item-${line.key}`}
                    value={line.refId}
                    disabled={isPending}
                    onChange={(event) => updateLine(line.key, { refId: event.target.value })}
                    className={inputClass}
                  >
                    <option value="">Selecione…</option>
                    {optionsFor(line.kind, line).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 col-span-3">
                  <label htmlFor={`package-quantity-${line.key}`} className={labelClass}>
                    {line.kind === "service" ? "Sessões" : "Unidades"}
                  </label>
                  <input
                    id={`package-quantity-${line.key}`}
                    type="text"
                    inputMode="numeric"
                    value={line.quantity}
                    disabled={isPending}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  disabled={isPending}
                  aria-label={`Remover o item ${index + 1}`}
                  className={`${iconButtonClass} col-span-1 mb-0.5`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addLine("service")}
                disabled={isPending || form.lines.length >= 30}
              >
                <Plus size={14} />
                Serviço
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addLine("product")}
                disabled={isPending || form.lines.length >= 30}
              >
                <Plus size={14} />
                Produto
              </Button>
            </div>
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
        title="Excluir pacote"
        description={
          toDelete && toDelete.sold > 0
            ? "Este pacote já foi vendido e não pode ser excluído. Desative-o em Editar para tirá-lo da comanda."
            : "O pacote sai da lista e da comanda. Pacote que já entrou em alguma comanda não pode ser excluído: desative-o. Esta ação não pode ser desfeita."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
