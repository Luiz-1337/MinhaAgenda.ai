"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeft, Plus, ShoppingCart, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createPurchase } from "@/app/actions/purchases"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import type { CreatePurchaseInput, PurchaseFormDTO } from "@/lib/types/purchase"
import { iconButtonClass, inputClass, labelClass, parseQuantity } from "../../inventory-ui"

type ItemDraft = {
  key: number
  productId: string
  quantity: string
  unitCost: string
  /** Lote e validade: só aparecem em produto com controle de estoque. */
  batchCode: string
  expiresOn: string
}

const NEW_ITEM = { productId: "", quantity: "1", unitCost: "", batchCode: "", expiresOn: "" }

/** none = só estoque · open = fica a pagar · paid = já saiu de uma conta */
type FinanceMode = "none" | "open" | "paid"

const INSTALLMENT_OPTIONS = Array.from({ length: 24 }, (_, index) => index + 1)

function costToInput(costPrice: string | null): string {
  return costPrice ? Number(costPrice).toFixed(2).replace(".", ",") : ""
}

/** Total de uma linha em centavos, ou NULL enquanto a linha não está completa. */
function lineCents(item: ItemDraft): number | null {
  const quantity = parseQuantity(item.quantity)
  const cost = item.unitCost.trim() ? parseBRL(item.unitCost) : null
  if (quantity === null || quantity <= 0 || cost === null || cost < 0) return null
  return Math.round(Math.round(quantity * 1000) * Math.round(cost * 100) / 1000)
}

function optionalMoney(input: string): number | null | "invalid" {
  if (!input.trim()) return null
  const value = parseBRL(input)
  return value === null || value < 0 ? "invalid" : value
}

/**
 * Nova compra (docs/ROADMAP.md, fase 4, fatia 4b).
 *
 * A conta que vale é a do servidor (domain/purchases.ts); o total mostrado aqui é
 * só para quem digita conferir com a nota.
 */
export function PurchaseForm({ salonId, data }: { salonId: string; data: PurchaseFormDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [supplierId, setSupplierId] = useState("")
  const [purchasedOn, setPurchasedOn] = useState(data.today)
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [freight, setFreight] = useState("")
  const [discount, setDiscount] = useState("")

  const [nextKey, setNextKey] = useState(1)
  const [items, setItems] = useState<ItemDraft[]>([{ key: 0, ...NEW_ITEM }])

  const [financeMode, setFinanceMode] = useState<FinanceMode>(data.finance ? "open" : "none")
  const [firstDueDate, setFirstDueDate] = useState(data.today)
  const [installments, setInstallments] = useState("1")
  const [accountId, setAccountId] = useState("")
  const [categoryId, setCategoryId] = useState("")

  const productById = useMemo(() => new Map(data.products.map((product) => [product.id, product])), [data.products])

  const itemsCents = items.reduce((sum, item) => sum + (lineCents(item) ?? 0), 0)
  const freightValue = optionalMoney(freight)
  const discountValue = optionalMoney(discount)
  const totalCents =
    itemsCents +
    (typeof freightValue === "number" ? Math.round(freightValue * 100) : 0) -
    (typeof discountValue === "number" ? Math.round(discountValue * 100) : 0)

  function updateItem(key: number, change: Partial<ItemDraft>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }

  function chooseProduct(key: number, productId: string) {
    // Escolher o produto traz o último custo pago: na maioria das compras ele se repete.
    // O lote era do produto anterior: trocar de produto limpa.
    updateItem(key, {
      productId,
      unitCost: costToInput(productById.get(productId)?.costPrice ?? null),
      batchCode: "",
      expiresOn: "",
    })
  }

  function addItem() {
    setItems((current) => [...current, { key: nextKey, ...NEW_ITEM }])
    setNextKey((key) => key + 1)
  }

  function removeItem(key: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((item) => item.key !== key)))
  }

  function submit() {
    if (!purchasedOn) {
      toast.error("Informe a data da compra")
      return
    }

    const payloadItems: CreatePurchaseInput["items"] = []
    for (const [index, item] of items.entries()) {
      const line = index + 1
      if (!item.productId) {
        toast.error(`Item ${line}: escolha o produto`)
        return
      }
      const quantity = parseQuantity(item.quantity)
      if (quantity === null || quantity <= 0) {
        toast.error(`Item ${line}: informe uma quantidade maior que zero`)
        return
      }
      const unitCost = item.unitCost.trim() ? parseBRL(item.unitCost) : null
      if (unitCost === null || unitCost < 0) {
        toast.error(`Item ${line}: informe o custo unitário`)
        return
      }
      // Produto sem controle não tem lote (os campos nem aparecem).
      const tracked = productById.get(item.productId)?.trackStock ?? false
      payloadItems.push({
        productId: item.productId,
        quantity,
        unitCost,
        batchCode: tracked ? item.batchCode.trim() || null : null,
        expiresOn: tracked ? item.expiresOn || null : null,
      })
    }

    if (freightValue === "invalid") {
      toast.error("Frete inválido")
      return
    }
    if (discountValue === "invalid") {
      toast.error("Desconto inválido")
      return
    }

    let finance: CreatePurchaseInput["finance"] = null
    if (financeMode === "paid") {
      if (!accountId) {
        toast.error("Informe a conta de onde o pagamento saiu")
        return
      }
      finance = { paid: true, accountId, categoryId: categoryId || null }
    } else if (financeMode === "open") {
      if (!firstDueDate) {
        toast.error("Informe o vencimento")
        return
      }
      finance = {
        paid: false,
        firstDueDate,
        installments: Number(installments),
        accountId: accountId || null,
        categoryId: categoryId || null,
      }
    }

    startTransition(async () => {
      const result = await createPurchase({
        salonId,
        supplierId: supplierId || null,
        purchasedOn,
        invoiceNumber: invoiceNumber.trim() || null,
        notes: notes.trim() || null,
        freight: freightValue,
        discount: discountValue,
        items: payloadItems,
        finance,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Compra lançada")
      router.push(`/${salonId}/inventory/purchases`)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/${salonId}/inventory/purchases`}
            aria-label="Voltar para as compras"
            className={iconButtonClass}
          >
            <ArrowLeft size={18} />
          </Link>
          <ShoppingCart size={24} className="text-muted-foreground" />
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Nova compra</h2>
        </div>
        <Button onClick={submit} disabled={isPending}>
          Lançar compra
        </Button>
      </div>

      <section className="bg-card border border-border rounded-md p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="purchase-supplier" className={labelClass}>
            Fornecedor (opcional)
          </label>
          <select
            id="purchase-supplier"
            value={supplierId}
            disabled={isPending}
            onChange={(event) => setSupplierId(event.target.value)}
            className={inputClass}
          >
            <option value="">Sem fornecedor</option>
            {data.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          {data.suppliers.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Nenhum fornecedor ativo. Cadastre ou reative em{" "}
              <Link href={`/${salonId}/inventory/suppliers`} className="font-semibold text-accent hover:underline">
                Fornecedores
              </Link>
              .
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-date" className={labelClass}>
            Data da compra
          </label>
          <input
            id="purchase-date"
            type="date"
            max={data.today}
            value={purchasedOn}
            disabled={isPending}
            onChange={(event) => setPurchasedOn(event.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="purchase-invoice" className={labelClass}>
            Nº da nota (opcional)
          </label>
          <input
            id="purchase-invoice"
            type="text"
            maxLength={60}
            value={invoiceNumber}
            disabled={isPending}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            className={inputClass}
          />
        </div>
      </section>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Produtos</h3>
          <Button variant="outline" size="sm" onClick={addItem} disabled={isPending || items.length >= 100}>
            <Plus size={14} />
            Produto
          </Button>
        </div>

        {data.products.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhum produto ativo. Cadastre em{" "}
            <Link href={`/${salonId}/products`} className="font-semibold text-accent hover:underline">
              Produtos
            </Link>
            .
          </p>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, index) => {
              const line = index + 1
              const product = productById.get(item.productId)
              const total = lineCents(item)
              return (
                <div key={item.key} className="p-3 grid grid-cols-2 md:grid-cols-12 gap-3 md:items-end">
                  <div className="flex flex-col gap-1 col-span-2 md:col-span-5">
                    <label htmlFor={`item-product-${item.key}`} className={labelClass}>
                      Produto
                    </label>
                    <select
                      id={`item-product-${item.key}`}
                      value={item.productId}
                      disabled={isPending}
                      onChange={(event) => chooseProduct(item.key, event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecione…</option>
                      {data.products.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                    {product && !product.trackStock && (
                      <p className="text-[11px] text-muted-foreground">
                        Sem controle de estoque: a compra atualiza o custo, mas não dá entrada.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label htmlFor={`item-quantity-${item.key}`} className={labelClass}>
                      Quantidade
                    </label>
                    <input
                      id={`item-quantity-${item.key}`}
                      type="text"
                      inputMode="decimal"
                      value={item.quantity}
                      disabled={isPending}
                      onChange={(event) => updateItem(item.key, { quantity: event.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label htmlFor={`item-cost-${item.key}`} className={labelClass}>
                      Custo unitário
                    </label>
                    <input
                      id={`item-cost-${item.key}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={item.unitCost}
                      disabled={isPending}
                      onChange={(event) => updateItem(item.key, { unitCost: event.target.value })}
                      className={inputClass}
                    />
                  </div>
                  {product?.trackStock && (
                    <>
                      <div className="flex flex-col gap-1 md:col-span-3 md:col-start-1 md:row-start-2">
                        <label htmlFor={`item-batch-${item.key}`} className={labelClass}>
                          Lote (opcional)
                        </label>
                        <input
                          id={`item-batch-${item.key}`}
                          type="text"
                          maxLength={60}
                          value={item.batchCode}
                          disabled={isPending}
                          onChange={(event) => updateItem(item.key, { batchCode: event.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div className="flex flex-col gap-1 md:col-span-2 md:row-start-2">
                        <label htmlFor={`item-expires-${item.key}`} className={labelClass}>
                          Validade (opcional)
                        </label>
                        <input
                          id={`item-expires-${item.key}`}
                          type="date"
                          value={item.expiresOn}
                          disabled={isPending}
                          onChange={(event) => updateItem(item.key, { expiresOn: event.target.value })}
                          className={inputClass}
                        />
                      </div>
                    </>
                  )}
                  <div className="flex items-center justify-between gap-2 col-span-2 md:col-span-3 md:col-start-10 md:row-start-1">
                    <div className="text-right flex-1">
                      <p className={labelClass}>Total</p>
                      <p className="font-mono tabular-nums font-semibold text-foreground">
                        {total === null ? "—" : formatBRL(total / 100)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      disabled={isPending || items.length === 1}
                      aria-label={`Remover o item ${line}`}
                      className={iconButtonClass}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="bg-card border border-border rounded-md p-4 flex flex-col gap-3 lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Financeiro</h3>

          {data.finance === null ? (
            <p className="text-sm text-muted-foreground">
              Esta compra só mexe no estoque: o financeiro não está ligado neste salão ou você não tem permissão para
              lançar nele.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-sm text-foreground">
                {(
                  [
                    ["open", "Fica a pagar"],
                    ["paid", "Já foi paga"],
                    ["none", "Não lançar no financeiro"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="purchase-finance"
                      value={value}
                      checked={financeMode === value}
                      disabled={isPending}
                      onChange={() => setFinanceMode(value)}
                      className="h-4 w-4 accent-foreground"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {financeMode !== "none" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {financeMode === "open" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="purchase-due" className={labelClass}>
                          Vencimento da 1ª parcela
                        </label>
                        <input
                          id="purchase-due"
                          type="date"
                          min={purchasedOn}
                          value={firstDueDate}
                          disabled={isPending}
                          onChange={(event) => setFirstDueDate(event.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor="purchase-installments" className={labelClass}>
                          Parcelas (uma por mês)
                        </label>
                        <select
                          id="purchase-installments"
                          value={installments}
                          disabled={isPending}
                          onChange={(event) => setInstallments(event.target.value)}
                          className={inputClass}
                        >
                          {INSTALLMENT_OPTIONS.map((count) => (
                            <option key={count} value={count}>
                              {count === 1 ? "À vista (1 parcela)" : `${count} parcelas`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex flex-col gap-1">
                    <label htmlFor="purchase-account" className={labelClass}>
                      {financeMode === "paid" ? "Saiu de qual conta?" : "Conta prevista (opcional)"}
                    </label>
                    <select
                      id="purchase-account"
                      value={accountId}
                      disabled={isPending}
                      onChange={(event) => setAccountId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">{financeMode === "paid" ? "Selecione…" : "Definir na baixa"}</option>
                      {data.finance.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="purchase-category" className={labelClass}>
                      Categoria (opcional)
                    </label>
                    <select
                      id="purchase-category"
                      value={categoryId}
                      disabled={isPending}
                      onChange={(event) => setCategoryId(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Sem categoria</option>
                      {data.finance.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {financeMode === "open" &&
                  "Gera as parcelas a pagar no financeiro. A baixa de cada uma é feita lá, quando for paga."}
                {financeMode === "paid" && "Gera uma despesa já paga, com a data da compra, saindo da conta escolhida."}
                {financeMode === "none" && "A compra entra no estoque e nada é lançado no financeiro."}
              </p>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="purchase-notes" className={labelClass}>
              Observações (opcional)
            </label>
            <textarea
              id="purchase-notes"
              rows={2}
              maxLength={500}
              value={notes}
              disabled={isPending}
              onChange={(event) => setNotes(event.target.value)}
              className={inputClass}
            />
          </div>
        </section>

        <section className="bg-card border border-border rounded-md p-4 flex flex-col gap-3 h-fit">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Produtos</span>
            <span className="font-mono tabular-nums text-foreground">{formatBRL(itemsCents / 100)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor="purchase-freight" className="text-muted-foreground">
              Frete e outros
            </label>
            <input
              id="purchase-freight"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={freight}
              disabled={isPending}
              onChange={(event) => setFreight(event.target.value)}
              className={`${inputClass} max-w-[8rem] text-right`}
            />
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label htmlFor="purchase-discount" className="text-muted-foreground">
              Desconto
            </label>
            <input
              id="purchase-discount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={discount}
              disabled={isPending}
              onChange={(event) => setDiscount(event.target.value)}
              className={`${inputClass} max-w-[8rem] text-right`}
            />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="font-bold text-foreground">Total</span>
            <span
              className={`font-mono tabular-nums font-bold text-lg ${totalCents < 0 ? "text-destructive" : "text-foreground"}`}
            >
              {formatBRL(totalCents / 100)}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
