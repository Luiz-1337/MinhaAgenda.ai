import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, ShieldOff } from "lucide-react"
import { getSale, getSaleDraftFromAppointment, getSaleFormOptions } from "@/app/actions/sales"
import { SaleEditor } from "./sale-editor"

function Blocked({ salonId, message }: { salonId: string; message: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <ShieldOff size={32} className="text-muted-foreground" />
      <h2 className="text-lg font-bold text-foreground">Comanda indisponível</h2>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      <Link
        href={`/${salonId}/sales`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
      >
        <ArrowLeft size={16} />
        Voltar para as comandas
      </Link>
    </div>
  )
}

export default async function SalePage({
  params,
  searchParams,
}: {
  params: Promise<{ salonId: string; saleId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { salonId, saleId } = await params
  const query = await searchParams
  const isNew = saleId === "new"

  const [options, sale] = await Promise.all([
    getSaleFormOptions(salonId),
    isNew ? Promise.resolve(null) : getSale(salonId, saleId),
  ])

  if ("error" in options) return <Blocked salonId={salonId} message={options.error} />
  if (sale && "error" in sale) return <Blocked salonId={salonId} message={sale.error} />
  if (isNew && !options.can.create) {
    return <Blocked salonId={salonId} message="Você não tem permissão para criar comandas" />
  }

  // "Criar comanda" na agenda chega como /sales/new?appointment=<id>.
  const appointmentId = typeof query.appointment === "string" ? query.appointment : undefined
  const draft = isNew && appointmentId ? await getSaleDraftFromAppointment(salonId, appointmentId) : null

  if (draft && "error" in draft) return <Blocked salonId={salonId} message={draft.error} />
  // O agendamento já está numa comanda: abre a que existe.
  if (draft && "existingSaleId" in draft) redirect(`/${salonId}/sales/${draft.existingSaleId}`)

  return (
    <SaleEditor
      // A chave troca quando o status muda (faturar/reabrir), para a tela remontar
      // com o que o servidor gravou em vez de reaproveitar estado de edição.
      key={sale ? `${sale.id}:${sale.status}` : `new:${appointmentId ?? ""}`}
      salonId={salonId}
      sale={sale}
      options={options}
      draft={draft}
      openInvoice={query.invoice === "1"}
    />
  )
}
