"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { saveServiceConsumption } from "@/app/actions/inventory"
import { formatBRL } from "@/lib/utils/money.utils"
import type { ServiceConsumptionDTO, ServiceConsumptionServiceDTO } from "@/lib/types/inventory"
import {
  InventoryNav,
  Modal,
  formatQuantity,
  iconButtonClass,
  inputClass,
  labelClass,
  parseQuantity,
} from "../inventory-ui"

type LineDraft = { key: number; productId: string; quantity: string }

/** "30 ml", "0,5 un" — a medida em que o consumo deste produto é informado. */
function unitLabel(contentUnit: string | null): string {
  return contentUnit ?? "un"
}

/**
 * Produtos consumidos por serviço (docs/ROADMAP.md, fase 4, fatia 4d).
 *
 * Aqui só se diz QUANTO cada serviço gasta. A baixa acontece sozinha quando a
 * comanda com o serviço é faturada, e volta quando ela é reaberta.
 */
export function ConsumptionClient({ salonId, data }: { salonId: string; data: ServiceConsumptionDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [editing, setEditing] = useState<ServiceConsumptionServiceDTO | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([])
  const [nextKey, setNextKey] = useState(0)

  const productById = useMemo(() => new Map(data.products.map((product) => [product.id, product])), [data.products])

  function openEdit(service: ServiceConsumptionServiceDTO) {
    setLines(
      service.lines.map((line, index) => ({
        key: index,
        productId: line.productId,
        quantity: formatQuantity(line.quantity),
      }))
    )
    setNextKey(service.lines.length)
    setEditing(service)
  }

  function addLine() {
    setLines((current) => [...current, { key: nextKey, productId: "", quantity: "" }])
    setNextKey((key) => key + 1)
  }

  function updateLine(key: number, change: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))
  }

  function submit() {
    const service = editing
    if (!service) return

    const items: { productId: string; quantity: number }[] = []
    const seen = new Set<string>()
    for (const [index, line] of lines.entries()) {
      const position = index + 1
      if (!line.productId) {
        toast.error(`Produto ${position}: escolha o produto`)
        return
      }
      if (seen.has(line.productId)) {
        toast.error(`Produto ${position}: já está na lista`)
        return
      }
      seen.add(line.productId)

      const quantity = parseQuantity(line.quantity)
      if (quantity === null || quantity <= 0) {
        toast.error(`Produto ${position}: informe uma quantidade maior que zero`)
        return
      }
      items.push({ productId: line.productId, quantity })
    }

    startTransition(async () => {
      const result = await saveServiceConsumption({ salonId, serviceId: service.serviceId, items })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(items.length === 0 ? "Consumo removido" : "Consumo salvo")
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <FlaskConical size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Consumo por serviço</h2>
          <p className="text-xs text-muted-foreground">
            O que cada atendimento gasta de produto. Faturar a comanda baixa o estoque sozinho; reabrir devolve.
          </p>
        </div>
      </div>

      <InventoryNav salonId={salonId} />

      <section className="bg-card border border-border rounded-md">
        {data.services.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum serviço cadastrado. Cadastre em{" "}
            <Link href={`/${salonId}/services`} className="font-semibold text-accent hover:underline">
              Serviços
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Serviço</th>
                  <th scope="col" className="p-3 text-left font-semibold">Consome por atendimento</th>
                  <th scope="col" className="p-3 text-right font-semibold">Custo estimado</th>
                  <th scope="col" className="p-3 w-12"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.services.map((service) => (
                  <tr key={service.serviceId} className={service.isActive ? undefined : "opacity-60"}>
                    <td className="p-3 font-semibold text-foreground">
                      {service.serviceName}
                      {!service.isActive && (
                        <span className="block text-[11px] font-normal text-muted-foreground">inativo</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {service.lines.length === 0 ? (
                        "—"
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {service.lines.map((line) => (
                            <li key={line.productId}>
                              <span className="font-mono tabular-nums text-foreground">
                                {formatQuantity(line.quantity)} {unitLabel(line.contentUnit)}
                              </span>{" "}
                              de {line.productName}
                              {!line.trackStock && (
                                <span className="text-[11px]"> · sem controle de estoque, não baixa</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                      {service.costCents > 0 ? formatBRL(service.costCents / 100) : "—"}
                    </td>
                    <td className="p-2">
                      {data.can.manage && (
                        <button
                          type="button"
                          onClick={() => openEdit(service)}
                          disabled={isPending}
                          aria-label={`Editar o consumo de ${service.serviceName}`}
                          title="Editar"
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
          O custo estimado usa o custo de compra do produto e, no produto fracionado, quanto cabe em uma unidade. Os
          dois são definidos em Produtos e saldo &gt; Configurar.
        </p>
      </section>

      {editing && (
        <Modal title={`Consumo — ${editing.serviceName}`} onClose={() => setEditing(null)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {lines.length === 0 && (
              <p className="text-sm text-muted-foreground">Este serviço não consome produto.</p>
            )}
            {lines.map((line, index) => {
              const position = index + 1
              const product = productById.get(line.productId)
              return (
                <div key={line.key} className="grid grid-cols-12 gap-2 items-end">
                  <div className="flex flex-col gap-1 col-span-7">
                    <label htmlFor={`consumption-product-${line.key}`} className={labelClass}>
                      Produto
                    </label>
                    <select
                      id={`consumption-product-${line.key}`}
                      value={line.productId}
                      disabled={isPending}
                      onChange={(event) => updateLine(line.key, { productId: event.target.value })}
                      className={inputClass}
                    >
                      <option value="">Selecione…</option>
                      {/* Produto inativo que já estava na lista continua aparecendo. */}
                      {line.productId && !product && <option value={line.productId}>Produto inativo</option>}
                      {data.products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 col-span-4">
                    <label htmlFor={`consumption-quantity-${line.key}`} className={labelClass}>
                      Quantidade ({unitLabel(product?.contentUnit ?? null)})
                    </label>
                    <input
                      id={`consumption-quantity-${line.key}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={line.quantity}
                      disabled={isPending}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                    disabled={isPending}
                    aria-label={`Remover o produto ${position}`}
                    className={`${iconButtonClass} col-span-1 mb-0.5`}
                  >
                    <Trash2 size={16} />
                  </button>
                  {product && !product.trackStock && (
                    <p className="col-span-12 text-[11px] text-muted-foreground">
                      Sem controle de estoque: fica no cadastro, mas não baixa.
                    </p>
                  )}
                  {product && product.trackStock && !product.contentUnit && (
                    <p className="col-span-12 text-[11px] text-muted-foreground">
                      Produto não fracionado: a quantidade é em unidades (0,05 = um vigésimo de unidade).
                    </p>
                  )}
                </div>
              )
            })}
            <div>
              <Button variant="outline" size="sm" onClick={addLine} disabled={isPending || lines.length >= 30}>
                <Plus size={14} />
                Produto
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
