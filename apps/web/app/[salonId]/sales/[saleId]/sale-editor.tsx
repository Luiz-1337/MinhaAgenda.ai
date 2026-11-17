"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  CalendarCheck,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  getSalePackageBalances,
  invoiceSale,
  receiveSalePayment,
  reopenSale,
  saveSale,
  searchSaleCustomers,
  voidSale,
} from "@/app/actions/sales"
import { SALE_STATUS_BADGE, SALE_STATUS_LABELS } from "@/lib/constants/sales.constants"
import { formatBRL, parseBRL } from "@/lib/utils/money.utils"
import { parseQuantity as parseTypedQuantity, quantityToInput } from "@/lib/utils/quantity.utils"
import { centsToNumeric, toCents } from "@repo/db/src/domain/sales"
import type {
  SaleCustomerOption,
  SaleDetailDTO,
  SaleDraftFromAppointment,
  SaleFormOptions,
  SaleItemInput,
  SalePackageBalanceDTO,
} from "@/lib/types/sale"

// ============================================================================
// Estado de edição
// ============================================================================

type ItemRow = {
  key: string
  kind: "service" | "product" | "package"
  /** id do serviço, do produto ou do pacote, conforme `kind`. Vazio = ainda não escolhido. */
  refId: string
  professionalId: string
  /** Quem auxiliou no serviço. Vazio = sem auxiliar. */
  assistantId: string
  quantity: string
  unitPrice: string
  discount: string
  appointmentId: string | null
  /** Item "do pacote" (fase 5): a linha do pacote do cliente. Sem cobrança. */
  packageLineId: string | null
  packageName: string | null
}

type PaymentRow = { key: string; methodId: string; amount: string }

let rowSeq = 0
const nextKey = () => `row-${++rowSeq}`

const inputClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60 disabled:cursor-not-allowed"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** "1200.50" (numeric do banco) → "1.200,50" para o campo. */
function moneyToInput(value: string | number | null): string {
  if (value === null) return ""
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Quantidade do item: maior que zero. A leitura (vírgula decimal, ponto de milhar)
 * é a mesma do estoque — lib/utils/quantity.utils.ts.
 */
function parseQuantity(input: string): number | null {
  const n = parseTypedQuantity(input)
  return n !== null && n > 0 ? n : null
}

/** ISO → valor de <input type="datetime-local">, no fuso do navegador. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Total do item em centavos — a MESMA conta do servidor (domain/sales.ts). Aqui é
 * só para mostrar enquanto a pessoa digita; quem grava é o servidor, que recalcula.
 */
function rowCents(row: ItemRow): { gross: number; discount: number } {
  const quantity = parseQuantity(row.quantity)
  const unit = row.unitPrice.trim() === "" ? null : toCents(parseBRL(row.unitPrice))
  const discount = toCents(parseBRL(row.discount)) ?? 0
  if (quantity === null || unit === null) return { gross: 0, discount }
  return { gross: Math.round((Math.round(quantity * 1000) * unit) / 1000), discount }
}

type AppointmentDraft = Extract<SaleDraftFromAppointment, { customer: unknown }>

function rowsFromSale(sale: SaleDetailDTO | null, draft: AppointmentDraft | null): ItemRow[] {
  if (!sale) {
    if (!draft) return []
    return draft.items.map((item) => ({
      key: nextKey(),
      kind: "service" as const,
      refId: item.serviceId,
      professionalId: item.professionalId,
      assistantId: "",
      quantity: "1",
      unitPrice: moneyToInput(item.suggestedPrice),
      discount: "",
      appointmentId: item.appointmentId,
      packageLineId: null,
      packageName: null,
    }))
  }
  return sale.items.map((item) => ({
    key: nextKey(),
    kind: item.kind,
    refId: (item.kind === "service" ? item.serviceId : item.kind === "package" ? item.packageTemplateId : item.productId) ?? "",
    professionalId: item.professionalId ?? "",
    assistantId: item.assistantId ?? "",
    // Sem separador de milhar: "1.000" no campo seria relido como um.
    quantity: quantityToInput(item.quantity),
    unitPrice: moneyToInput(item.unitPrice),
    discount: Number(item.discountAmount) > 0 ? moneyToInput(item.discountAmount) : "",
    appointmentId: item.appointmentId,
    packageLineId: item.customerPackageItemId,
    packageName: item.packageName,
  }))
}

// ============================================================================
// Tela
// ============================================================================

export function SaleEditor({
  salonId,
  sale,
  options,
  draft,
  openInvoice,
  today,
}: {
  salonId: string
  sale: SaleDetailDTO | null
  options: SaleFormOptions
  /** Comanda nova aberta a partir de agendamentos ("Criar comanda" / "Agrupar em comanda"). */
  draft: AppointmentDraft | null
  openInvoice: boolean
  /** O dia de hoje em Brasília ("YYYY-MM-DD"). */
  today: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const status = sale?.status ?? "open"
  const editable = status === "open" && (sale ? options.can.edit : options.can.create)

  const [customer, setCustomer] = useState<SaleCustomerOption | null>(sale?.customer ?? draft?.customer ?? null)
  const [saleDate, setSaleDate] = useState(() => toLocalInput(sale?.saleDate ?? new Date().toISOString()))
  const [notes, setNotes] = useState(sale?.notes ?? "")
  const [rows, setRows] = useState<ItemRow[]>(() => rowsFromSale(sale, draft))
  const [dirty, setDirty] = useState(false)

  // Chegar com ?invoice=1 (comanda nova salva pelo botão Faturar) já abre o
  // faturamento, com uma linha no valor total gravado.
  const startInvoicing = openInvoice && status === "open" && options.can.invoice && sale !== null
  const [invoiceOpen, setInvoiceOpen] = useState(startInvoicing)
  const [payments, setPayments] = useState<PaymentRow[]>(() =>
    startInvoicing && sale && Number(sale.total) > 0
      ? [{ key: nextKey(), methodId: options.paymentMethods[0]?.id ?? "", amount: moneyToInput(sale.total) }]
      : []
  )
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)

  // O diálogo de pagamentos serve a dois momentos: faturar a comanda aberta e
  // receber depois o que ficou em aberto numa comanda já faturada.
  const [dialogMode, setDialogMode] = useState<"invoice" | "receive">("invoice")
  // Fiado: deixar parte (ou tudo) em aberto de propósito. Exige marcar a caixa.
  const [acceptDebt, setAcceptDebt] = useState(false)
  const [debtDueDate, setDebtDueDate] = useState("")

  const amountDueCents = sale ? (toCents(sale.amountDue) ?? 0) : 0
  const hasDebt = status === "invoiced" && amountDueCents > 0
  const debtOverdue = hasDebt && !!sale?.debtDueDate && sale.debtDueDate < today

  // Itens gravados podem apontar para serviço, produto ou profissional que foi
  // desativado depois — some do catálogo ativo, mas tem que continuar aparecendo.
  const serviceOptions = useMemo(() => {
    const known = new Set(options.services.map((s) => s.id))
    const extra = (sale?.items ?? [])
      .filter((i) => i.kind === "service" && i.serviceId && !known.has(i.serviceId))
      .map((i) => ({ id: i.serviceId as string, name: i.description, suggestedPrice: null }))
    return [...options.services, ...extra]
  }, [options.services, sale])

  const productOptions = useMemo(() => {
    const known = new Set(options.products.map((p) => p.id))
    const extra = (sale?.items ?? [])
      .filter((i) => i.kind === "product" && i.productId && !known.has(i.productId))
      .map((i) => ({ id: i.productId as string, name: i.description, price: null }))
    return [...options.products, ...extra]
  }, [options.products, sale])

  // Pacote desativado depois de entrar na comanda continua aparecendo nela.
  const packageOptions = useMemo(() => {
    const known = new Set(options.packageTemplates.map((p) => p.id))
    const extra = (sale?.items ?? [])
      .filter((i) => i.kind === "package" && i.packageTemplateId && !known.has(i.packageTemplateId))
      .map((i) => ({ id: i.packageTemplateId as string, name: i.description, price: null }))
    return [...options.packageTemplates, ...extra]
  }, [options.packageTemplates, sale])

  const hasPackageItem = rows.some((row) => row.kind === "package")
  const hasPackageUse = rows.some((row) => row.packageLineId !== null)

  // O que o cliente ainda tem nos pacotes (fase 5, fatia 5b). Recarrega quando o
  // cliente muda; o saldo não conta esta comanda.
  const customerId = customer?.id ?? null
  const saleId = sale?.id
  const balancesEnabled = options.packagesEnabled && editable && customerId !== null
  const balancesQuery = useQuery({
    queryKey: ["sale-package-balances", salonId, customerId, saleId ?? null],
    queryFn: async (): Promise<SalePackageBalanceDTO[]> => {
      const result = await getSalePackageBalances(salonId, customerId as string, saleId)
      if ("error" in result) throw new Error(result.error)
      return result
    },
    enabled: balancesEnabled,
  })
  const balances = useMemo(
    () => (balancesEnabled ? (balancesQuery.data ?? []) : []),
    [balancesEnabled, balancesQuery.data]
  )

  // Saldo de cada linha descontando o que os itens desta comanda já usam.
  const availableByLine = useMemo(() => {
    const available = new Map(balances.map((balance) => [balance.lineId, balance.remaining]))
    for (const row of rows) {
      if (!row.packageLineId || !available.has(row.packageLineId)) continue
      const quantity = parseQuantity(row.quantity) ?? 0
      available.set(row.packageLineId, (available.get(row.packageLineId) ?? 0) - quantity)
    }
    return available
  }, [balances, rows])

  const usableBalances = balances.filter((balance) => (availableByLine.get(balance.lineId) ?? 0) > 0)

  const professionalOptions = useMemo(() => {
    const known = new Set(options.professionals.map((p) => p.id))
    // Profissional ou auxiliar que saiu do salão continua aparecendo na comanda dele.
    const extra: { id: string; name: string }[] = []
    for (const item of sale?.items ?? []) {
      for (const [id, name] of [
        [item.professionalId, item.professionalName],
        [item.assistantId, item.assistantName],
      ]) {
        if (!id || known.has(id)) continue
        known.add(id)
        extra.push({ id, name: name ?? "Profissional" })
      }
    }
    return [...options.professionals, ...extra]
  }, [options.professionals, sale])

  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    for (const row of rows) {
      const cents = rowCents(row)
      subtotal += cents.gross
      discount += cents.discount
    }
    return { subtotal, discount, total: subtotal - discount }
  }, [rows])

  // --------------------------------------------------------------------------
  // Itens
  // --------------------------------------------------------------------------

  function updateRow(key: string, patch: Partial<ItemRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
    setDirty(true)
  }

  function addRow(kind: "service" | "product" | "package") {
    setRows((current) => [
      ...current,
      {
        key: nextKey(),
        kind,
        refId: "",
        professionalId: "",
        assistantId: "",
        quantity: "1",
        unitPrice: "",
        discount: "",
        appointmentId: null,
        packageLineId: null,
        packageName: null,
      },
    ])
    setDirty(true)
  }

  /** Uma sessão (ou unidade) do pacote do cliente: sem cobrança. */
  function addPackageUse(lineId: string) {
    const balance = balances.find((b) => b.lineId === lineId)
    if (!balance) return
    setRows((current) => [
      ...current,
      {
        key: nextKey(),
        kind: balance.kind,
        refId: (balance.kind === "service" ? balance.serviceId : balance.productId) ?? "",
        professionalId: "",
        assistantId: "",
        quantity: "1",
        unitPrice: "0,00",
        discount: "",
        appointmentId: null,
        packageLineId: balance.lineId,
        packageName: balance.packageName,
      },
    ])
    setDirty(true)
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key))
    setDirty(true)
  }

  /** Escolher o item preenche o valor sugerido do cadastro — sugestão, não trava. */
  function chooseItem(row: ItemRow, refId: string) {
    const suggested =
      row.kind === "service"
        ? serviceOptions.find((s) => s.id === refId)?.suggestedPrice ?? null
        : row.kind === "package"
          ? packageOptions.find((p) => p.id === refId)?.price ?? null
          : productOptions.find((p) => p.id === refId)?.price ?? null

    updateRow(row.key, { refId, unitPrice: suggested === null ? "" : moneyToInput(suggested) })
  }

  // --------------------------------------------------------------------------
  // Salvar
  // --------------------------------------------------------------------------

  function buildItems(): SaleItemInput[] | string {
    const items: SaleItemInput[] = []

    for (const [index, row] of rows.entries()) {
      const label = `Item ${index + 1}`
      if (!row.refId) {
        return `${label}: escolha o ${row.kind === "service" ? "serviço" : row.kind === "package" ? "pacote" : "produto"}`
      }
      if (row.kind === "service" && !row.professionalId) return `${label}: informe o profissional`
      if (row.assistantId && row.assistantId === row.professionalId) {
        return `${label}: o auxiliar não pode ser o próprio profissional`
      }

      const quantity = parseQuantity(row.quantity)
      if (quantity === null) return `${label}: quantidade inválida`

      if (row.packageLineId && !Number.isInteger(quantity)) return `${label}: a quantidade do pacote é inteira`

      // Item do pacote não é cobrado: valor e desconto zero, sempre.
      const unitPrice = row.packageLineId ? 0 : row.unitPrice.trim() === "" ? null : parseBRL(row.unitPrice)
      if (row.unitPrice.trim() !== "" && (unitPrice === null || unitPrice < 0)) return `${label}: valor inválido`

      const discountAmount = row.packageLineId ? 0 : row.discount.trim() === "" ? 0 : parseBRL(row.discount)
      if (discountAmount === null || discountAmount < 0) return `${label}: desconto inválido`

      items.push({
        kind: row.kind,
        serviceId: row.kind === "service" ? row.refId : null,
        productId: row.kind === "product" ? row.refId : null,
        packageTemplateId: row.kind === "package" ? row.refId : null,
        professionalId: row.professionalId || null,
        assistantId: row.kind === "service" ? row.assistantId || null : null,
        quantity,
        unitPrice,
        discountAmount,
        appointmentId: row.appointmentId,
        customerPackageItemId: row.packageLineId,
      })
    }

    return items
  }

  function openInvoiceDialog() {
    const firstMethod = options.paymentMethods[0]?.id ?? ""
    setDialogMode("invoice")
    setAcceptDebt(false)
    setDebtDueDate("")
    setPayments(
      totals.total > 0 ? [{ key: nextKey(), methodId: firstMethod, amount: moneyToInput(centsToNumeric(totals.total)) }] : []
    )
    setInvoiceOpen(true)
  }

  function openReceiveDialog() {
    if (!sale) return
    setDialogMode("receive")
    setPayments([
      { key: nextKey(), methodId: options.paymentMethods[0]?.id ?? "", amount: moneyToInput(sale.amountDue) },
    ])
    setInvoiceOpen(true)
  }

  function save(thenInvoice: boolean) {
    if (!customer) {
      toast.error("Selecione o cliente")
      return
    }
    const parsedDate = new Date(saleDate)
    if (Number.isNaN(parsedDate.getTime())) {
      toast.error("Informe a data da comanda")
      return
    }
    const items = buildItems()
    if (typeof items === "string") {
      toast.error(items)
      return
    }

    startTransition(async () => {
      const result = await saveSale({
        salonId,
        saleId: sale?.id,
        customerId: customer.id,
        saleDate: parsedDate.toISOString(),
        notes,
        items,
      })

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      setDirty(false)

      if (!sale) {
        // Comanda nova: vai para a URL dela (e abre o faturamento, se foi pedido).
        const saleId = result.data?.saleId
        router.replace(`/${salonId}/sales/${saleId}${thenInvoice ? "?invoice=1" : ""}`)
        return
      }

      toast.success("Comanda salva")
      router.refresh()
      if (thenInvoice) openInvoiceDialog()
    })
  }

  function handleInvoiceClick() {
    // Fatura-se o que está GRAVADO. Com alteração pendente (ou comanda nova), salva
    // antes — senão o total da tela e o do servidor poderiam divergir.
    if (!sale || dirty) save(true)
    else openInvoiceDialog()
  }

  // --------------------------------------------------------------------------
  // Faturar / reabrir / excluir
  // --------------------------------------------------------------------------

  const paidCents = payments.reduce((sum, p) => sum + (toCents(parseBRL(p.amount)) ?? 0), 0)
  // O alvo do diálogo: o total, ao faturar; o valor em aberto, ao receber depois.
  const targetCents = dialogMode === "receive" ? amountDueCents : totals.total
  const remainingCents = targetCents - paidCents
  const leavingDebt = dialogMode === "invoice" && acceptDebt && options.can.invoiceDebt && remainingCents > 0

  const confirmBlocked =
    remainingCents < 0 ||
    (dialogMode === "invoice"
      ? rows.length === 0 || (remainingCents > 0 && !leavingDebt)
      : paidCents <= 0)

  function confirmInvoice() {
    if (!sale) return

    const list: { paymentMethodId: string; amount: number }[] = []
    for (const payment of payments) {
      const amount = parseBRL(payment.amount)
      if (!payment.methodId) {
        toast.error("Selecione a forma de pagamento")
        return
      }
      if (amount === null || amount <= 0) {
        toast.error("Informe o valor de cada pagamento")
        return
      }
      list.push({ paymentMethodId: payment.methodId, amount })
    }

    if (dialogMode === "receive") {
      startTransition(async () => {
        const result = await receiveSalePayment({ salonId, saleId: sale.id, payments: list })
        if ("error" in result) {
          toast.error(result.error)
          return
        }
        toast.success(Number(result.data?.remaining ?? 0) > 0 ? "Pagamento recebido" : "Débito quitado")
        setInvoiceOpen(false)
        router.refresh()
      })
      return
    }

    startTransition(async () => {
      const result = await invoiceSale({
        salonId,
        saleId: sale.id,
        payments: list,
        acceptDebt: leavingDebt,
        debtDueDate: leavingDebt && debtDueDate ? debtDueDate : null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(leavingDebt ? "Comanda faturada com valor em aberto" : "Comanda faturada")
      setInvoiceOpen(false)
      // Tira o ?invoice=1 da URL para um F5 não reabrir o diálogo.
      router.replace(`/${salonId}/sales/${sale.id}`)
      router.refresh()
    })
  }

  function doReopen() {
    if (!sale) return
    startTransition(async () => {
      const result = await reopenSale(salonId, sale.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Comanda reaberta")
      router.refresh()
    })
  }

  function doVoid() {
    if (!sale) return
    startTransition(async () => {
      const result = await voidSale(salonId, sale.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Comanda excluída")
      router.push(`/${salonId}/sales`)
    })
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/${salonId}/sales`}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Voltar para as comandas"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Receipt size={20} className="text-accent" />
              {sale ? `Comanda #${sale.number}` : "Nova comanda"}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-bold ${SALE_STATUS_BADGE[status]}`}
              >
                {SALE_STATUS_LABELS[status]}
              </span>
            </h2>
            {sale?.invoicedAt && (
              <p className="text-xs text-muted-foreground">
                Faturada em {dateTimeFormat.format(new Date(sale.invoicedAt))}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {status === "open" && sale && options.can.delete && (
            <button
              onClick={() => setConfirmVoid(true)}
              disabled={isPending}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Trash2 size={16} />
              Excluir
            </button>
          )}
          {editable && (
            <Button onClick={() => save(false)} variant="outline" loading={isPending} className="font-bold">
              {!isPending && <Save size={16} />}
              Salvar
            </Button>
          )}
          {status === "open" && options.can.invoice && (editable || !dirty) && (
            <Button onClick={handleInvoiceClick} loading={isPending} className="font-bold shadow-md">
              {!isPending && <Wallet size={16} />}
              Faturar
            </Button>
          )}
          {hasDebt && options.can.invoice && (
            <Button onClick={openReceiveDialog} loading={isPending} className="font-bold shadow-md">
              {!isPending && <Wallet size={16} />}
              Receber
            </Button>
          )}
          {status === "invoiced" && options.can.reopen && (
            <Button onClick={() => setConfirmReopen(true)} variant="outline" loading={isPending} className="font-bold">
              {!isPending && <RotateCcw size={16} />}
              Reabrir
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar md:pr-4 space-y-6">
        {hasDebt && sale && (
          <div
            role="status"
            className={`rounded-md border p-4 text-sm ${
              debtOverdue
                ? "bg-destructive/10 border-destructive/20 text-destructive"
                : "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
            }`}
          >
            <span className="font-bold">Em aberto: {formatBRL(sale.amountDue)}</span>
            {" de "}
            {formatBRL(sale.total)}
            {sale.debtDueDate
              ? ` · ${debtOverdue ? "venceu" : "vence"} em ${sale.debtDueDate.split("-").reverse().join("/")}`
              : " · sem data combinada"}
          </div>
        )}

        {status === "void" && (
          <div className="bg-muted border border-border rounded-md p-4 text-sm text-muted-foreground">
            Comanda excluída
            {sale?.voidedAt ? ` em ${dateTimeFormat.format(new Date(sale.voidedAt))}` : ""}
            {sale?.voidReason ? `. Motivo: ${sale.voidReason}` : "."}
          </div>
        )}

        {/* Cabeçalho da comanda */}
        <section className="bg-card border border-border rounded-md p-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-1.5">
            <span className={labelClass}>Cliente</span>
            <CustomerPicker
              salonId={salonId}
              customer={customer}
              disabled={!editable}
              onChange={(next) => {
                setCustomer(next)
                setDirty(true)
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="sale-date" className={labelClass}>
              Data
            </label>
            <input
              id="sale-date"
              type="datetime-local"
              value={saleDate}
              disabled={!editable}
              onChange={(event) => {
                setSaleDate(event.target.value)
                setDirty(true)
              }}
              className={inputClass}
            />
          </div>
        </section>

        {/* Itens */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className={labelClass}>Itens</h3>
            {editable && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addRow("service")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  <Plus size={14} />
                  Serviço
                </button>
                <button
                  onClick={() => addRow("product")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  <Plus size={14} />
                  Produto
                </button>
                {options.packagesEnabled && (
                  <button
                    onClick={() => addRow("package")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  >
                    <Plus size={14} />
                    Pacote
                  </button>
                )}
                {/* Usar o pacote: só aparece quando o cliente tem saldo. */}
                {usableBalances.length > 0 && (
                  <select
                    aria-label="Usar o pacote do cliente"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) addPackageUse(event.target.value)
                    }}
                    className="px-3 py-1.5 rounded-md border border-accent/40 bg-accent/10 text-xs font-bold text-foreground hover:bg-accent/20 transition-colors cursor-pointer"
                  >
                    <option value="">+ Do pacote</option>
                    {usableBalances.map((balance) => (
                      <option key={balance.lineId} value={balance.lineId}>
                        {balance.packageName} · {balance.description} (saldo {availableByLine.get(balance.lineId)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-sm text-muted-foreground">
              Nenhum item. Adicione um serviço ou um produto.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-md divide-y divide-border">
              {rows.map((row, index) => {
                const cents = rowCents(row)
                const itemOptions =
                  row.kind === "service" ? serviceOptions : row.kind === "package" ? packageOptions : productOptions
                const itemLabel = row.kind === "service" ? "Serviço" : row.kind === "package" ? "Pacote" : "Produto"

                return (
                  <div key={row.key} className="p-3 grid gap-3 md:grid-cols-12 md:items-end">
                    <div className="md:col-span-4 space-y-1">
                      <label htmlFor={`${row.key}-item`} className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                        {itemLabel}
                        {row.appointmentId && (
                          <span className="inline-flex items-center gap-1 text-accent" title="Veio de um agendamento">
                            <CalendarCheck size={12} />
                            agendamento
                          </span>
                        )}
                        {row.packageLineId && (
                          <span className="text-accent truncate" title="Sai do pacote do cliente, sem cobrança">
                            do pacote {row.packageName ?? ""}
                          </span>
                        )}
                      </label>
                      <select
                        id={`${row.key}-item`}
                        value={row.refId}
                        // O item do pacote é o da linha do pacote: não se troca.
                        disabled={!editable || row.packageLineId !== null}
                        onChange={(event) => chooseItem(row, event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Selecione…</option>
                        {itemOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3 space-y-1">
                      <label htmlFor={`${row.key}-pro`} className="text-[11px] font-semibold text-muted-foreground">
                        {row.kind === "service" ? "Profissional" : "Vendedor (opcional)"}
                      </label>
                      <select
                        id={`${row.key}-pro`}
                        value={row.professionalId}
                        disabled={!editable}
                        onChange={(event) =>
                          updateRow(row.key, {
                            professionalId: event.target.value,
                            // Quem executa não pode ser o próprio auxiliar.
                            ...(event.target.value === row.assistantId ? { assistantId: "" } : {}),
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">{row.kind === "service" ? "Selecione…" : "—"}</option>
                        {professionalOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-1 space-y-1">
                      <label htmlFor={`${row.key}-qty`} className="text-[11px] font-semibold text-muted-foreground">
                        Qtde
                      </label>
                      <input
                        id={`${row.key}-qty`}
                        type="text"
                        inputMode="decimal"
                        value={row.quantity}
                        // Um item de pacote é um pacote: a quantidade é sempre 1.
                        disabled={!editable || row.kind === "package"}
                        title={row.kind === "package" ? "Um item para cada pacote" : undefined}
                        onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div className="md:col-span-1 space-y-1">
                      <label htmlFor={`${row.key}-price`} className="text-[11px] font-semibold text-muted-foreground">
                        Valor
                      </label>
                      <input
                        id={`${row.key}-price`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={row.unitPrice}
                        disabled={!editable || row.packageLineId !== null}
                        title={row.packageLineId ? "Item do pacote não é cobrado" : undefined}
                        onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
                        className={inputClass}
                      />
                    </div>

                    <div className="md:col-span-1 space-y-1">
                      <label htmlFor={`${row.key}-disc`} className="text-[11px] font-semibold text-muted-foreground">
                        Desconto
                      </label>
                      <input
                        id={`${row.key}-disc`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={row.discount}
                        disabled={!editable || row.packageLineId !== null}
                        onChange={(event) => updateRow(row.key, { discount: event.target.value })}
                        className={inputClass}
                      />
                    </div>

                    {/* Auxiliar: com comissões ligadas, ou quando o item já tem um gravado. */}
                    {row.kind === "service" && (options.commissionsEnabled || row.assistantId) && (
                      <div className="md:order-last md:col-start-5 md:col-span-3 space-y-1">
                        <label htmlFor={`${row.key}-assistant`} className="text-[11px] font-semibold text-muted-foreground">
                          Auxiliar (opcional)
                        </label>
                        <select
                          id={`${row.key}-assistant`}
                          value={row.assistantId}
                          disabled={!editable}
                          onChange={(event) => updateRow(row.key, { assistantId: event.target.value })}
                          className={inputClass}
                        >
                          <option value="">Sem auxiliar</option>
                          {professionalOptions
                            .filter((option) => option.id !== row.professionalId)
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2">
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-muted-foreground">Total</p>
                        <p className="font-mono text-sm font-medium text-foreground tabular-nums">
                          {row.packageLineId
                            ? "Pacote"
                            : row.unitPrice.trim() === ""
                              ? "—"
                              : formatBRL(centsToNumeric(Math.max(0, cents.gross - cents.discount)))}
                        </p>
                        {row.packageLineId && editable && availableByLine.has(row.packageLineId) && (
                          <p
                            className={`text-[11px] ${
                              (availableByLine.get(row.packageLineId) ?? 0) < 0 ? "text-destructive" : "text-muted-foreground"
                            }`}
                          >
                            {(availableByLine.get(row.packageLineId) ?? 0) < 0
                              ? "passa do saldo"
                              : `sobram ${availableByLine.get(row.packageLineId)}`}
                          </p>
                        )}
                      </div>
                      {editable && (
                        <button
                          onClick={() => removeRow(row.key)}
                          className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label={`Remover o item ${index + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Observações e totais */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="sale-notes" className={labelClass}>
              Observações
            </label>
            <textarea
              id="sale-notes"
              rows={4}
              maxLength={2000}
              value={notes}
              disabled={!editable}
              onChange={(event) => {
                setNotes(event.target.value)
                setDirty(true)
              }}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="bg-card border border-border rounded-md p-4 space-y-2 text-sm self-start">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatBRL(centsToNumeric(totals.subtotal))}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Descontos</span>
              <span className="font-mono tabular-nums">− {formatBRL(centsToNumeric(totals.discount))}</span>
            </div>
            <div className="flex justify-between text-foreground font-bold text-base border-t border-border pt-2">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatBRL(centsToNumeric(Math.max(0, totals.total)))}</span>
            </div>
          </div>
        </section>

        {/* Pagamentos de uma comanda faturada */}
        {sale && sale.payments.length > 0 && (
          <section className="space-y-3">
            <h3 className={labelClass}>Pagamentos</h3>
            <div className="bg-card border border-border rounded-md divide-y divide-border">
              {sale.payments.map((payment) => (
                <div key={payment.id} className="p-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm">
                  <span className="font-semibold text-foreground">{payment.methodName}</span>
                  <span className="text-xs text-muted-foreground">
                    Pago em {dateTimeFormat.format(new Date(payment.paidAt))} · taxa{" "}
                    {Number(payment.feePercent).toLocaleString("pt-BR")}% ({formatBRL(payment.feeAmount)}) · recebe em{" "}
                    {payment.settlesOn.split("-").reverse().join("/")}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">{formatBRL(payment.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Faturar */}
      <Dialog open={invoiceOpen} onOpenChange={(open) => !open && !isPending && setInvoiceOpen(false)}>
        <DialogContent
          className="!max-w-xl max-h-[90vh] overflow-hidden flex flex-col bg-card border-border p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {dialogMode === "receive" ? "Receber pagamento" : "Faturar comanda"}
          </DialogTitle>
          <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">
                {dialogMode === "receive" ? "Receber pagamento" : "Faturar comanda"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {dialogMode === "receive" ? "Em aberto" : "Total"}{" "}
                {formatBRL(centsToNumeric(Math.max(0, targetCents)))}
              </p>
            </div>
            <button
              onClick={() => setInvoiceOpen(false)}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {targetCents === 0 ? (
              <p className="text-sm text-muted-foreground">
                Esta comanda não tem valor a receber. Ela será finalizada sem pagamento.
              </p>
            ) : options.paymentMethods.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma forma de pagamento ativa.{" "}
                <Link href={`/${salonId}/salon-settings/payment-methods`} className="text-accent font-semibold hover:underline">
                  Cadastre uma
                </Link>{" "}
                para faturar.
              </p>
            ) : (
              <>
                {payments.map((payment, index) => {
                  const method = options.paymentMethods.find((m) => m.id === payment.methodId)
                  const amountCents = toCents(parseBRL(payment.amount)) ?? 0
                  const feeCents = method
                    ? Math.round((amountCents * Math.round(Number(method.feePercent) * 100)) / 10_000)
                    : 0

                  return (
                    <div key={payment.key} className="grid gap-3 grid-cols-12 items-end">
                      <div className="col-span-7 space-y-1">
                        <label htmlFor={`${payment.key}-method`} className="text-[11px] font-semibold text-muted-foreground">
                          Forma de pagamento
                        </label>
                        <select
                          id={`${payment.key}-method`}
                          value={payment.methodId}
                          disabled={isPending}
                          onChange={(event) =>
                            setPayments((current) =>
                              current.map((p) => (p.key === payment.key ? { ...p, methodId: event.target.value } : p))
                            )
                          }
                          className={inputClass}
                        >
                          {options.paymentMethods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4 space-y-1">
                        <label htmlFor={`${payment.key}-amount`} className="text-[11px] font-semibold text-muted-foreground">
                          Valor
                        </label>
                        <input
                          id={`${payment.key}-amount`}
                          type="text"
                          inputMode="decimal"
                          value={payment.amount}
                          disabled={isPending}
                          onChange={(event) =>
                            setPayments((current) =>
                              current.map((p) => (p.key === payment.key ? { ...p, amount: event.target.value } : p))
                            )
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {/* A última linha só sai quando dá para faturar sem pagamento
                            nenhum (fiado inteiro). */}
                        {(payments.length > 1 || (dialogMode === "invoice" && options.can.invoiceDebt)) && (
                          <button
                            onClick={() => setPayments((current) => current.filter((p) => p.key !== payment.key))}
                            disabled={isPending}
                            className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            aria-label={`Remover o pagamento ${index + 1}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      {method && amountCents > 0 && (
                        <p className="col-span-12 -mt-1 text-[11px] text-muted-foreground">
                          Taxa {formatBRL(centsToNumeric(feeCents))} · líquido{" "}
                          {formatBRL(centsToNumeric(amountCents - feeCents))}
                          {method.settlementDays > 0
                            ? ` · recebe em ${method.settlementDays} ${method.settlementDays === 1 ? "dia" : "dias"}`
                            : " · recebe na hora"}
                        </p>
                      )}
                    </div>
                  )
                })}

                <button
                  onClick={() =>
                    setPayments((current) => [
                      ...current,
                      {
                        key: nextKey(),
                        methodId: options.paymentMethods[0]?.id ?? "",
                        amount: remainingCents > 0 ? moneyToInput(centsToNumeric(remainingCents)) : "",
                      },
                    ])
                  }
                  disabled={isPending}
                  className="flex items-center gap-1.5 text-xs font-bold text-accent hover:underline disabled:opacity-50"
                >
                  <Plus size={14} />
                  {payments.length === 0 ? "Adicionar pagamento" : "Dividir em outra forma"}
                </button>

                <p
                  className={`text-sm font-semibold ${
                    remainingCents === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : remainingCents > 0 && (leavingDebt || dialogMode === "receive")
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-destructive"
                  }`}
                  role="status"
                >
                  {remainingCents === 0
                    ? dialogMode === "receive"
                      ? "Quita o valor em aberto."
                      : "Pagamentos fecham o total."
                    : remainingCents < 0
                      ? `Passou ${dialogMode === "receive" ? "do valor em aberto" : "do total"} em ${formatBRL(centsToNumeric(-remainingCents))}`
                      : dialogMode === "receive"
                        ? `Continuam ${formatBRL(centsToNumeric(remainingCents))} em aberto`
                        : leavingDebt
                          ? `Ficam ${formatBRL(centsToNumeric(remainingCents))} em aberto para a cliente`
                          : `Faltam ${formatBRL(centsToNumeric(remainingCents))}`}
                </p>

                {/* Fiado: só aparece quando falta valor e a pessoa tem a permissão. */}
                {dialogMode === "invoice" && options.can.invoiceDebt && remainingCents > 0 && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <Checkbox
                        aria-label="Deixar o restante em aberto"
                        checked={acceptDebt}
                        disabled={isPending}
                        onChange={(event) => setAcceptDebt(event.target.checked)}
                      />
                      Deixar {formatBRL(centsToNumeric(remainingCents))} em aberto (fiado)
                    </label>
                    {acceptDebt && (
                      <div className="space-y-1">
                        <label htmlFor="debt-due-date" className="text-[11px] font-semibold text-muted-foreground">
                          Combinado para (opcional)
                        </label>
                        <input
                          id="debt-due-date"
                          type="date"
                          value={debtDueDate}
                          disabled={isPending}
                          onChange={(event) => setDebtDueDate(event.target.value)}
                          className={inputClass}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/50">
            <button
              type="button"
              onClick={() => setInvoiceOpen(false)}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <Button
              onClick={confirmInvoice}
              size="lg"
              loading={isPending}
              disabled={confirmBlocked}
              className="font-bold shadow-md"
            >
              {!isPending && <Wallet size={18} />}
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        onConfirm={doVoid}
        title="Excluir comanda"
        description="A comanda sai da lista e os agendamentos ligados a ela ficam livres para entrar em outra. Esta ação não pode ser desfeita."
        confirmText="Excluir"
        type="danger"
      />

      <ConfirmModal
        open={confirmReopen}
        onClose={() => setConfirmReopen(false)}
        onConfirm={doReopen}
        title="Reabrir comanda"
        description={
          "Os pagamentos registrados serão removidos e os agendamentos desta comanda voltam para confirmado, sem valor cobrado." +
          (options.commissionsEnabled
            ? " As comissões desta comanda são apagadas e voltam a ser calculadas quando ela for faturada."
            : "") +
          (options.inventoryEnabled
            ? " Os produtos com estoque controlado voltam para o estoque e saem de novo quando ela for faturada."
            : "") +
          (hasPackageItem
            ? " Os pacotes vendidos nesta comanda deixam de existir e são criados de novo quando ela for faturada."
            : "") +
          (hasPackageUse ? " O que esta comanda usou dos pacotes do cliente volta para o saldo." : "") +
          " Depois de editar, é preciso faturar de novo."
        }
        confirmText="Reabrir"
        type="warning"
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
  customer: SaleCustomerOption | null
  disabled: boolean
  onChange: (customer: SaleCustomerOption | null) => void
}) {
  const [term, setTerm] = useState("")
  // O resultado guarda PARA QUAL termo ele vale. "Buscando" e "lista vazia" saem
  // dessa comparação, sem estado extra para manter em sincronia.
  const [found, setFound] = useState<{ term: string; results: SaleCustomerOption[] }>({ term: "", results: [] })

  const cleaned = term.trim()
  const searching = cleaned.length >= 2 && found.term !== cleaned
  const results = found.term === cleaned ? found.results : []

  useEffect(() => {
    if (cleaned.length < 2) return

    // Espera a pessoa parar de digitar; e descarta a resposta de uma busca antiga
    // que chegue depois de uma mais nova.
    let cancelled = false
    const timer = setTimeout(async () => {
      const response = await searchSaleCustomers(salonId, cleaned)
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
          <button
            onClick={() => onChange(null)}
            className="text-xs font-bold text-accent hover:underline flex-shrink-0"
          >
            Trocar
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
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
        <div className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto" role="listbox" aria-label="Clientes encontrados">
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
