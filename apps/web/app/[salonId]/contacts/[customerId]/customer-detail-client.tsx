"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft, MessageSquare, BellOff, AlertTriangle, Plus,
  Mail, Phone, CalendarClock,
} from "lucide-react"
import { getCustomerDetail, addCustomerNote } from "@/app/actions/customers"
import { Button } from "@/components/ui/button"
import { RefetchIndicator } from "@/components/ui/refetch-indicator"
import { TagPill } from "@/components/contacts/tag-pill"
import { formatPhoneBR } from "@/lib/utils/phone.utils"
import { formatBrazilTime } from "@/lib/utils/timezone.utils"
import { formatBRL } from "@/lib/utils/money.utils"
import { appointmentStatusLabel, appointmentStatusStyle } from "@/lib/utils/appointment-status"
import { useSalonAuth } from "@/contexts/salon-context"
import type { CustomerDetail } from "@/lib/types/customer"

interface Props {
  salonId: string
  initialDetail: CustomerDetail
}

export default function CustomerDetailClient({ salonId, initialDetail }: Props) {
  const queryClient = useQueryClient()
  const { isStaff } = useSalonAuth()
  const [noteBody, setNoteBody] = useState("")
  const [isPending, startTransition] = useTransition()

  const { data: detail, isFetching } = useQuery({
    queryKey: ["customer-detail", salonId, initialDetail.id],
    queryFn: async () => {
      const res = await getCustomerDetail(salonId, initialDetail.id)
      if ("error" in res) {
        toast.error(res.error)
        return initialDetail
      }
      return res.data ?? initialDetail
    },
    initialData: initialDetail,
  })

  const m = detail.metrics
  const now = Date.now()
  const upcoming = detail.appointments
    .filter((a) => new Date(a.date).getTime() > now && a.status !== "cancelled")
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const past = detail.appointments.filter((a) => new Date(a.date).getTime() <= now)

  function handleAddNote() {
    const body = noteBody.trim()
    if (!body) return
    startTransition(async () => {
      const res = await addCustomerNote(salonId, detail.id, body)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      setNoteBody("")
      toast.success("Nota adicionada")
      void queryClient.invalidateQueries({ queryKey: ["customer-detail", salonId, detail.id] })
    })
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Cabeçalho */}
      <div className="flex-shrink-0">
        <Link
          href={`/${salonId}/contacts`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          Contatos
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-foreground tracking-tight truncate">
                {detail.name}
              </h2>
              <RefetchIndicator active={isFetching} />
              {/* Opt-out: `customers.opted_out_at` existia desde sempre e não havia
                  UMA referência a ele em todo o apps/web. Quem abre a ficha para
                  mandar mensagem precisa ver isso antes de tentar. */}
              {detail.optedOutAt && (
                <span
                  title={detail.optOutReason ?? undefined}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20"
                >
                  <BellOff size={13} />
                  Não quer receber mensagens
                </span>
              )}
              {detail.noShowRisk.isHighRisk && (
                <span
                  title={`${Math.round(detail.noShowRisk.ratio * 100)}% de falta em ${detail.noShowRisk.sampleSize} atendimentos`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-600/20 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-600/40"
                >
                  <AlertTriangle size={13} />
                  Risco de falta
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} /> {formatPhoneBR(detail.phone) || detail.phone}
              </span>
              {detail.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail size={14} /> {detail.email}
                </span>
              )}
              {upcoming[0] && (
                <span className="inline-flex items-center gap-1.5 text-accent">
                  <CalendarClock size={14} />
                  Próxima: {formatBrazilTime(new Date(upcoming[0].date), "dd/MM 'às' HH:mm")}
                </span>
              )}
            </div>

            {detail.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.tags.map((t) => <TagPill key={t.id} tag={t} />)}
              </div>
            )}
          </div>

          {/* Só aparece quando o chat foi encontrado. O casamento chat↔contato ainda
              é por telefone em string, e há contatos sem DDI que nunca batem —
              oferecer um link quebrado seria pior que não oferecer. */}
          {detail.chatId && (
            <Link href={`/${salonId}/chat?chatId=${detail.chatId}`}>
              <Button variant="outline" className="flex items-center gap-2">
                <MessageSquare size={16} />
                Abrir conversa
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-4">
        {/* Métricas */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Total gasto" value={formatBRL(m.totalSpent)} />
          <Metric label="Ticket médio" value={formatBRL(m.averageTicket)} />
          <Metric
            label="Atendimentos"
            value={m.completedCount > 0 ? String(m.completedCount) : "—"}
            hint={m.visits365 > 0 ? `${m.visits365} no último ano` : undefined}
          />
          <Metric
            label="Faltas"
            value={m.completedCount + m.noShowCount > 0 ? String(m.noShowCount) : "—"}
            hint={m.cancelledCount > 0 ? `${m.cancelledCount} cancelamento(s)` : undefined}
          />
        </section>

        {m.completedCount === 0 && (
          <p className="text-xs text-muted-foreground -mt-3">
            Os valores aparecem a partir do primeiro atendimento concluído na agenda.
          </p>
        )}

        {/* Histórico */}
        <Card title="Histórico de atendimentos">
          {detail.appointments.length === 0 ? (
            <Empty>Nenhum agendamento registrado.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {upcoming.length > 0 && (
                <p className="pb-2 text-[11px] uppercase font-semibold tracking-wider text-accent">
                  Próximos
                </p>
              )}
              {[...upcoming, ...past].map((a) => {
                const style = appointmentStatusStyle(a.status)
                return (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {a.serviceName}
                        <span className="text-muted-foreground"> · {a.professionalName}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatBrazilTime(new Date(a.date), "dd/MM/yyyy 'às' HH:mm")}
                        {a.cancelReason ? ` · ${a.cancelReason}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {a.status === "completed" && (
                        <span className="text-sm font-semibold text-foreground">
                          {formatBRL(a.priceCharged)}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${style.bg} ${style.text}`}>
                        {appointmentStatusLabel(a.status)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Notas */}
        <Card title="Notas de atendimento">
          {!isStaff && (
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input
                type="text"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddNote() }}
                maxLength={2000}
                placeholder="Ex.: prefere não usar secador"
                disabled={isPending}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
              />
              <Button onClick={handleAddNote} loading={isPending} disabled={!noteBody.trim()}>
                <Plus size={16} /> Adicionar
              </Button>
            </div>
          )}
          {detail.notes.length === 0 ? (
            <Empty>Nenhuma nota ainda.</Empty>
          ) : (
            <div className="divide-y divide-border">
              {detail.notes.map((n) => (
                <div key={n.id} className="py-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.authorName ?? "Autor removido"} ·{" "}
                    {formatBrazilTime(new Date(n.createdAt), "dd/MM/yyyy 'às' HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Preferências: jsonb livre, somente-leitura. A UI gerencia só `notes`, que
            está sendo substituída por customer_notes; as outras chaves são as que a
            IA aprendeu na conversa. */}
        {detail.preferences && Object.keys(detail.preferences).length > 0 && (
          <Card title="Preferências e observações">
            <dl className="space-y-2">
              {Object.entries(detail.preferences).map(([key, value]) => (
                <div key={key} className="flex flex-col sm:flex-row sm:gap-3">
                  <dt className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground sm:w-40 flex-shrink-0">
                    {key}
                  </dt>
                  <dd className="text-sm text-foreground break-words">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {/* Trinks: só quando o cliente foi ENCONTRADO lá. Em produção são 25/25 com
            trinks_not_found, então hoje o bloco não aparece — melhor que exibir zeros. */}
        {detail.trinks && (
          <Card title="Histórico no Trinks">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric label="Gasto (Trinks)" value={formatBRL(detail.trinks.totalSpent)} />
              <Metric label="Ticket (Trinks)" value={formatBRL(detail.trinks.averageTicket)} />
              <Metric
                label="Visitas (1 ano)"
                value={detail.trinks.visitCount365Days != null ? String(detail.trinks.visitCount365Days) : "—"}
              />
              <Metric
                label="Última visita"
                value={detail.trinks.lastVisitAt
                  ? formatBrazilTime(new Date(detail.trinks.lastVisitAt), "dd/MM/yyyy")
                  : "—"}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

/** Mostra "—" quando não há dado. Nunca 0: "sem histórico" não é "gastou zero". */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-2">{children}</p>
}
