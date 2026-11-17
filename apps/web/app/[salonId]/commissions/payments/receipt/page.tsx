import Link from "next/link"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { getCommissionReceipts } from "@/app/actions/commissions"
import { COMMISSION_ADJUSTMENT_KIND_LABELS } from "@/lib/constants/commissions.constants"
import { formatBRL } from "@/lib/utils/money.utils"
import type { CommissionReceiptDTO } from "@/lib/types/commission"
import { PrintButton } from "./print-button"

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** "2026-11-20" → "20/11/2026". Data de calendário: sem fuso, sem Date. */
function formatDate(value: string): string {
  return value.split("-").reverse().join("/")
}

/**
 * Na impressão, só os recibos vão para o papel: o menu e os botões do painel ficam
 * de fora, e cada recibo começa numa folha. `visibility` (e não `display`) porque o
 * recibo está dentro do layout do painel — esconder um ancestral com `display`
 * esconderia o recibo junto.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #commission-receipts, #commission-receipts * { visibility: visible !important; }
  #commission-receipts { position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; }
  #commission-receipts .receipt {
    break-after: page;
    border: 0 !important;
    background: #fff !important;
    color: #000 !important;
  }
  #commission-receipts .receipt * { color: #000 !important; border-color: #999 !important; }
  #commission-receipts .receipt:last-child { break-after: auto; }
}
`

function Receipt({ salonName, receipt }: { salonName: string; receipt: CommissionReceiptDTO }) {
  const { payment, entries, adjustments } = receipt

  return (
    <article className="receipt bg-card border border-border rounded-md p-6 flex flex-col gap-5 text-sm text-foreground">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold">Recibo de comissão</h3>
          <p className="text-muted-foreground">{salonName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor</p>
          <p className="text-xl font-bold tabular-nums">{formatBRL(payment.amount)}</p>
        </div>
      </header>

      <p>
        Recebi de <strong>{salonName}</strong> a quantia de <strong>{formatBRL(payment.amount)}</strong>, referente às
        comissões em aberto até {formatDate(payment.cutoffDate)}, conforme o demonstrativo abaixo.
      </p>

      {entries.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-border">
              <th scope="col" className="py-1.5 pr-2 font-semibold">Data</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">Comanda</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">Item</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Comissão</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border/50">
                <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">
                  {entry.releaseDate ? formatDate(entry.releaseDate) : "—"}
                </td>
                <td className="py-1.5 pr-2 whitespace-nowrap">
                  #{entry.saleNumber}
                  {entry.customerName && ` · ${entry.customerName}`}
                </td>
                <td className="py-1.5 pr-2">
                  {entry.description}
                  {entry.role === "assistant" && " (auxiliar)"}
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatBRL(entry.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adjustments.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left border-b border-border">
              <th scope="col" className="py-1.5 pr-2 font-semibold">Data</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">Lançamento</th>
              <th scope="col" className="py-1.5 pr-2 font-semibold">Observação</th>
              <th scope="col" className="py-1.5 text-right font-semibold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((adjustment) => (
              <tr key={adjustment.id} className="border-b border-border/50">
                <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">{formatDate(adjustment.referenceDate)}</td>
                <td className="py-1.5 pr-2">{COMMISSION_ADJUSTMENT_KIND_LABELS[adjustment.kind]}</td>
                <td className="py-1.5 pr-2">{adjustment.notes ?? "—"}</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {adjustment.kind === "advance" ? "− " : "+ "}
                  {formatBRL(adjustment.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className="self-end w-full max-w-xs text-sm">
        <div className="flex justify-between py-0.5">
          <dt className="text-muted-foreground">Comissões</dt>
          <dd className="font-mono tabular-nums">{formatBRL(payment.entriesAmount)}</dd>
        </div>
        <div className="flex justify-between py-0.5">
          <dt className="text-muted-foreground">Vales</dt>
          <dd className="font-mono tabular-nums">− {formatBRL(payment.advancesAmount)}</dd>
        </div>
        <div className="flex justify-between py-0.5">
          <dt className="text-muted-foreground">Bonificações</dt>
          <dd className="font-mono tabular-nums">+ {formatBRL(payment.bonusesAmount)}</dd>
        </div>
        <div className="flex justify-between py-1 mt-1 border-t border-border font-bold">
          <dt>Valor pago</dt>
          <dd className="font-mono tabular-nums">{formatBRL(payment.amount)}</dd>
        </div>
      </dl>

      <footer className="flex flex-col gap-8 pt-2">
        <p className="text-muted-foreground">
          Pago em {formatDate(payment.paidOn)}
          {payment.accountName && ` · ${payment.accountName}`}
          {payment.notes && ` · ${payment.notes}`}
        </p>
        <div className="self-center w-full max-w-sm text-center">
          <div className="border-t border-foreground pt-1.5 font-semibold">{payment.professionalName}</div>
        </div>
      </footer>
    </article>
  )
}

/**
 * Recibo de comissão para imprimir (docs/ROADMAP.md, fase 3, fatia 3d):
 * `?payment=<id>` = um recibo; `?batch=<id>` = todos os do lote, um por folha.
 */
export default async function CommissionReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId } = await params
  const query = await searchParams

  // A action confere sessão, módulo e permissão; sem "ver de todos", só devolve o
  // recibo da própria pessoa.
  const data = await getCommissionReceipts(salonId, {
    paymentId: first(query.payment) || undefined,
    batchId: first(query.batch) || undefined,
  })

  if ("error" in data || data.receipts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <ShieldOff size={32} className="text-muted-foreground" />
        <h2 className="text-lg font-bold text-foreground">Recibo indisponível</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {"error" in data ? data.error : "Pagamento não encontrado. Ele pode ter sido estornado."}
        </p>
        <Link href={`/${salonId}/commissions/payments`} className="text-sm font-semibold text-accent hover:underline">
          Voltar para os pagamentos
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <style>{PRINT_CSS}</style>

      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/${salonId}/commissions/payments`}
            aria-label="Voltar para os pagamentos"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {data.receipts.length === 1 ? "Recibo de comissão" : `${data.receipts.length} recibos de comissão`}
          </h2>
        </div>
        <PrintButton />
      </div>

      <div id="commission-receipts" className="flex flex-col gap-6 max-w-3xl">
        {data.receipts.map((receipt) => (
          <Receipt key={receipt.payment.id} salonName={data.salonName} receipt={receipt} />
        ))}
      </div>
    </div>
  )
}
