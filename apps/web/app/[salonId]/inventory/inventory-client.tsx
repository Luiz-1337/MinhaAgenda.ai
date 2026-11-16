"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftRight, Boxes, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createStockMovement, saveProductStockSettings } from "@/app/actions/inventory"
import {
  STOCK_MOVEMENT_HINTS,
  STOCK_MOVEMENT_KIND_LABELS,
  STOCK_STATUS_LABELS,
} from "@/lib/constants/inventory.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { ManualStockMovementKind, StockStatus } from "@repo/db"
import type { InventoryDTO, InventoryProductDTO } from "@/lib/types/inventory"
import {
  InventoryNav,
  Modal,
  controlClass,
  formatQuantity,
  iconButtonClass,
  inputClass,
  labelClass,
  parseQuantity,
} from "./inventory-ui"

const MANUAL_KINDS: ManualStockMovementKind[] = ["in", "out", "adjustment"]

const STATUS_CLASS: Record<StockStatus, string> = {
  untracked: "bg-muted border-border text-muted-foreground",
  negative: "bg-destructive/10 border-destructive/20 text-destructive",
  out: "bg-destructive/10 border-destructive/20 text-destructive",
  low: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
}

type View = "all" | "to_buy" | "untracked"

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
 * Estoque (docs/ROADMAP.md, fase 4, fatia 4a).
 *
 * O saldo é a soma dos movimentos — a tela nunca o edita direto. Para corrigir,
 * lança-se um acerto com o que foi contado na prateleira.
 */
export function InventoryClient({ salonId, data }: { salonId: string; data: InventoryDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [view, setView] = useState<View>("all")

  const [moving, setMoving] = useState<InventoryProductDTO | null>(null)
  const [kind, setKind] = useState<ManualStockMovementKind>("in")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [notes, setNotes] = useState("")

  const [configuring, setConfiguring] = useState<InventoryProductDTO | null>(null)
  const [trackStock, setTrackStock] = useState(false)
  const [minStock, setMinStock] = useState("")
  const [costPrice, setCostPrice] = useState("")
  const [sku, setSku] = useState("")
  const [barcode, setBarcode] = useState("")
  const [brandId, setBrandId] = useState("")
  const [categoryId, setCategoryId] = useState("")

  const visible = useMemo(() => {
    if (view === "to_buy") {
      return data.products.filter(
        (product) => product.status === "low" || product.status === "out" || product.status === "negative"
      )
    }
    if (view === "untracked") return data.products.filter((product) => !product.trackStock)
    return data.products
  }, [data.products, view])

  function openMovement(product: InventoryProductDTO) {
    setMoving(product)
    setKind("in")
    setQuantity("")
    setUnitCost("")
    setNotes("")
  }

  function openSettings(product: InventoryProductDTO) {
    setConfiguring(product)
    setTrackStock(product.trackStock)
    setMinStock(Number(product.minStock) > 0 ? formatQuantity(product.minStock) : "")
    setCostPrice(product.costPrice ? Number(product.costPrice).toFixed(2).replace(".", ",") : "")
    setSku(product.sku ?? "")
    setBarcode(product.barcode ?? "")
    setBrandId(product.brandId ?? "")
    setCategoryId(product.categoryId ?? "")
  }

  function submitMovement() {
    const product = moving
    if (!product) return

    const value = parseQuantity(quantity)
    if (value === null || value < 0 || (kind !== "adjustment" && value === 0)) {
      toast.error(kind === "adjustment" ? "Informe quanto foi contado" : "Informe uma quantidade maior que zero")
      return
    }

    let cost: number | null = null
    if (kind === "in" && unitCost.trim()) {
      cost = parseBRL(unitCost)
      if (cost === null || cost < 0) {
        toast.error("Custo unitário inválido")
        return
      }
    }

    startTransition(async () => {
      const result = await createStockMovement({
        salonId,
        productId: product.id,
        kind,
        quantity: value,
        unitCost: cost,
        notes: notes.trim() || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(`${STOCK_MOVEMENT_KIND_LABELS[kind]} lançad${kind === "adjustment" ? "o" : "a"}`)
      setMoving(null)
      router.refresh()
    })
  }

  function submitSettings() {
    const product = configuring
    if (!product) return

    const min = minStock.trim() ? parseQuantity(minStock) : 0
    if (min === null || min < 0) {
      toast.error("Estoque mínimo inválido")
      return
    }

    let cost: number | null = null
    if (costPrice.trim()) {
      cost = parseBRL(costPrice)
      if (cost === null || cost < 0) {
        toast.error("Custo de compra inválido")
        return
      }
    }

    startTransition(async () => {
      const result = await saveProductStockSettings({
        salonId,
        productId: product.id,
        trackStock,
        minStock: min,
        costPrice: cost,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        brandId: brandId || null,
        categoryId: categoryId || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Controle de estoque salvo")
      setConfiguring(null)
      router.refresh()
    })
  }

  function filterMovements(productId: string) {
    startTransition(() => router.push(productId ? `${pathname}?product=${productId}` : pathname))
  }

  const tabClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
    }`

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center gap-2 flex-shrink-0">
        <Boxes size={24} className="text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Estoque</h2>
          <p className="text-xs text-muted-foreground">
            O saldo é a soma das movimentações. Venda em comanda baixa sozinha os produtos controlados.
          </p>
        </div>
      </div>

      <InventoryNav salonId={salonId} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label="Produtos controlados"
          value={String(data.totals.tracked)}
          hint={`de ${data.products.length} ${data.products.length === 1 ? "produto" : "produtos"}`}
        />
        <Stat label="Para comprar" value={String(data.totals.toBuy)} hint="Abaixo do mínimo, zerados ou negativos" />
        <Stat label="Valor em estoque" value={formatBRL(data.totals.valueCents / 100)} hint="Saldo × custo de compra" />
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Produtos</h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setView("all")} className={tabClass(view === "all")}>
              Todos
            </button>
            <button type="button" onClick={() => setView("to_buy")} className={tabClass(view === "to_buy")}>
              Para comprar ({data.totals.toBuy})
            </button>
            <button type="button" onClick={() => setView("untracked")} className={tabClass(view === "untracked")}>
              Sem controle
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.products.length === 0 ? (
              <>
                Nenhum produto cadastrado. Cadastre em{" "}
                <Link href={`/${salonId}/products`} className="font-semibold text-accent hover:underline">
                  Produtos
                </Link>
                .
              </>
            ) : view === "to_buy" ? (
              "Nenhum produto controlado abaixo do mínimo."
            ) : (
              "Nenhum produto nesta lista."
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-right font-semibold">Estoque</th>
                  <th scope="col" className="p-3 text-right font-semibold">Mínimo</th>
                  <th scope="col" className="p-3 text-right font-semibold">Comprar</th>
                  <th scope="col" className="p-3 text-right font-semibold">Custo</th>
                  <th scope="col" className="p-3 text-right font-semibold">Valor</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((product) => (
                  <tr key={product.id} className={product.isActive ? undefined : "opacity-60"}>
                    <td className="p-3 font-semibold text-foreground">
                      {product.name}
                      {(product.sku || product.brandName || product.categoryName || !product.isActive) && (
                        <span className="block text-[11px] font-normal text-muted-foreground">
                          {[product.sku, product.brandName, product.categoryName, product.isActive ? null : "inativo"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td
                      className={`p-3 text-right font-mono tabular-nums font-semibold ${
                        product.status === "negative" ? "text-destructive" : "text-foreground"
                      }`}
                    >
                      {product.trackStock ? formatQuantity(product.quantity) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                      {product.trackStock && Number(product.minStock) > 0 ? formatQuantity(product.minStock) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                      {Number(product.suggestion) > 0 ? formatQuantity(product.suggestion) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                      {product.costPrice ? formatBRL(product.costPrice) : "—"}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                      {product.valueCents > 0 ? formatBRL(product.valueCents / 100) : "—"}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${STATUS_CLASS[product.status]}`}
                      >
                        {STOCK_STATUS_LABELS[product.status]}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-1">
                        {data.can.move && product.trackStock && (
                          <button
                            type="button"
                            onClick={() => openMovement(product)}
                            disabled={isPending}
                            className={iconButtonClass}
                            aria-label={`Movimentar ${product.name}`}
                            title="Movimentar"
                          >
                            <ArrowLeftRight size={16} />
                          </button>
                        )}
                        {data.can.manage && (
                          <button
                            type="button"
                            onClick={() => openSettings(product)}
                            disabled={isPending}
                            className={iconButtonClass}
                            aria-label={`Configurar o estoque de ${product.name}`}
                            title="Configurar"
                          >
                            <Settings2 size={16} />
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
      </section>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Movimentações</h3>
          <div className="flex items-center gap-2">
            <label htmlFor="movements-product" className={labelClass}>
              Produto
            </label>
            <select
              id="movements-product"
              value={data.productId ?? ""}
              disabled={isPending}
              onChange={(event) => filterMovements(event.target.value)}
              className={controlClass}
            >
              <option value="">Todos</option>
              {data.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {data.movements.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma movimentação.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Produto</th>
                  <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                  <th scope="col" className="p-3 text-left font-semibold">Observação</th>
                  <th scope="col" className="p-3 text-right font-semibold">Custo</th>
                  <th scope="col" className="p-3 text-right font-semibold">Quantidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.movements.map((movement) => {
                  const entered = Number(movement.quantity) > 0
                  return (
                    <tr key={movement.id}>
                      <td className="p-3 tabular-nums text-muted-foreground whitespace-nowrap">
                        {new Date(movement.createdAt).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {movement.userName && <span className="block text-[11px]">por {movement.userName}</span>}
                      </td>
                      <td className="p-3 text-foreground">{movement.productName}</td>
                      <td className="p-3 text-muted-foreground">{STOCK_MOVEMENT_KIND_LABELS[movement.kind]}</td>
                      <td className="p-3 text-muted-foreground">
                        {movement.saleId && movement.saleNumber !== null ? (
                          <Link
                            href={`/${salonId}/sales/${movement.saleId}`}
                            className="font-mono font-semibold text-accent hover:underline"
                          >
                            Comanda #{movement.saleNumber}
                          </Link>
                        ) : movement.purchaseId ? (
                          <Link
                            href={`/${salonId}/inventory/purchases`}
                            className="font-semibold text-accent hover:underline"
                          >
                            Ver compras
                          </Link>
                        ) : (
                          (movement.notes ?? "—")
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">
                        {movement.unitCost ? formatBRL(movement.unitCost) : "—"}
                      </td>
                      <td
                        className={`p-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          entered ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                        }`}
                      >
                        {entered ? "+ " : "− "}
                        {formatQuantity(String(Math.abs(Number(movement.quantity))))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data.movementsTruncated && (
          <p className="p-3 border-t border-border text-xs text-muted-foreground">
            Mostrando as {data.movements.length} movimentações mais recentes. Filtre por produto para ver as dele.
          </p>
        )}
      </section>

      {moving && (
        <Modal title={`Movimentar — ${moving.name}`} onClose={() => setMoving(null)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Estoque atual: <strong className="text-foreground">{formatQuantity(moving.quantity)}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="movement-kind" className={labelClass}>
                  Tipo
                </label>
                <select
                  id="movement-kind"
                  value={kind}
                  disabled={isPending}
                  onChange={(event) => setKind(event.target.value as ManualStockMovementKind)}
                  className={inputClass}
                >
                  {MANUAL_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {STOCK_MOVEMENT_KIND_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="movement-quantity" className={labelClass}>
                  {kind === "adjustment" ? "Quantidade contada" : "Quantidade"}
                </label>
                <input
                  id="movement-quantity"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={quantity}
                  disabled={isPending}
                  onChange={(event) => setQuantity(event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {kind === "in" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="movement-cost" className={labelClass}>
                  Custo unitário (opcional)
                </label>
                <input
                  id="movement-cost"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={unitCost}
                  disabled={isPending}
                  onChange={(event) => setUnitCost(event.target.value)}
                  className={inputClass}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="movement-notes" className={labelClass}>
                Observação (opcional)
              </label>
              <input
                id="movement-notes"
                type="text"
                maxLength={500}
                value={notes}
                disabled={isPending}
                onChange={(event) => setNotes(event.target.value)}
                className={inputClass}
              />
            </div>
            <p className="text-xs text-muted-foreground">{STOCK_MOVEMENT_HINTS[kind]}</p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setMoving(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitMovement} disabled={isPending}>
              Lançar {STOCK_MOVEMENT_KIND_LABELS[kind].toLowerCase()}
            </Button>
          </div>
        </Modal>
      )}

      {configuring && (
        <Modal title={`Estoque — ${configuring.name}`} onClose={() => setConfiguring(null)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-4">
            <label className="flex items-start gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={trackStock}
                disabled={isPending}
                onChange={(event) => setTrackStock(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-foreground"
              />
              <span>
                <span className="font-semibold">Controlar o estoque deste produto</span>
                <span className="block text-xs text-muted-foreground">
                  Ligado, a venda em comanda baixa o estoque e o produto entra na sugestão de compra. O saldo
                  começa em zero: lance um acerto com o que há na prateleira.
                </span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-min" className={labelClass}>
                  Estoque mínimo
                </label>
                <input
                  id="settings-min"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={minStock}
                  disabled={isPending}
                  onChange={(event) => setMinStock(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-cost" className={labelClass}>
                  Custo de compra
                </label>
                <input
                  id="settings-cost"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={costPrice}
                  disabled={isPending}
                  onChange={(event) => setCostPrice(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-sku" className={labelClass}>
                  Código (opcional)
                </label>
                <input
                  id="settings-sku"
                  type="text"
                  maxLength={60}
                  value={sku}
                  disabled={isPending}
                  onChange={(event) => setSku(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-barcode" className={labelClass}>
                  Código de barras (opcional)
                </label>
                <input
                  id="settings-barcode"
                  type="text"
                  maxLength={60}
                  value={barcode}
                  disabled={isPending}
                  onChange={(event) => setBarcode(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-brand" className={labelClass}>
                  Marca
                </label>
                <select
                  id="settings-brand"
                  value={brandId}
                  disabled={isPending}
                  onChange={(event) => setBrandId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem marca</option>
                  {data.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="settings-category" className={labelClass}>
                  Categoria
                </label>
                <select
                  id="settings-category"
                  value={categoryId}
                  disabled={isPending}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem categoria</option>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setConfiguring(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitSettings} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
