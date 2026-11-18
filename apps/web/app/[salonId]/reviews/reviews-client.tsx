"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy, Settings, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { deleteReview, saveReviewSettings } from "@/app/actions/reviews"
import type { ReviewDTO, ReviewsDTO } from "@/lib/types/reviews"
import {
  Modal,
  controlClass,
  formatCalendarDate,
  iconButtonClass,
  inputClass,
  labelClass,
} from "../inventory/inventory-ui"

type StatusFilter = "all" | "answered" | "pending"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  )
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Nota ${rating} de 5`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          className={value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}
        />
      ))}
    </span>
  )
}

/** "1,5 h", "2 dias" — o tempo médio de resposta, em palavras. */
function responseTime(hours: number | null): string {
  if (hours === null) return "—"
  if (hours < 1) return "Menos de 1 h"
  if (hours < 48) return `${hours.toLocaleString("pt-BR")} h`
  return `${Math.round(hours / 24)} dias`
}

/**
 * Avaliações pós-atendimento (docs/ROADMAP.md, fase 6, fatia 6c): o painel (média,
 * total, taxa e tempo de resposta, distribuição por nota, por profissional), a
 * lista e a personalização do formulário.
 *
 * O período vive na URL (`?from=&to=`), pelo dia do atendimento.
 */
export function ReviewsClient({ salonId, data }: { salonId: string; data: ReviewsDTO }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [status, setStatus] = useState<StatusFilter>("all")
  const [ratingFilter, setRatingFilter] = useState(0)
  const [professionalFilter, setProfessionalFilter] = useState("")
  const [search, setSearch] = useState("")
  const [toDelete, setToDelete] = useState<ReviewDTO | null>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isEnabled, setIsEnabled] = useState(data.settings.isEnabled)
  const [title, setTitle] = useState(data.settings.title ?? "")
  const [welcomeText, setWelcomeText] = useState(data.settings.welcomeText ?? "")
  const [thanksText, setThanksText] = useState(data.settings.thanksText ?? "")

  const { dashboard } = data

  function navigate(next: { from: string; to: string }) {
    const params = new URLSearchParams(next)
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // Quem aparece nas avaliações do período, para o filtro.
  const professionals = useMemo(() => {
    const seen = new Map<string, string>()
    for (const review of data.reviews) {
      for (const professional of review.professionals) seen.set(professional.id, professional.name)
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [data.reviews])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.reviews.filter((review) => {
      if (status === "answered" && review.rating === null) return false
      if (status === "pending" && review.rating !== null) return false
      if (ratingFilter > 0 && review.rating !== ratingFilter) return false
      if (professionalFilter && !review.professionals.some((p) => p.id === professionalFilter)) return false
      if (term && !review.customerName.toLowerCase().includes(term)) return false
      return true
    })
  }, [data.reviews, status, ratingFilter, professionalFilter, search])

  const maxInDistribution = Math.max(1, ...dashboard.distribution)

  function copyLink(review: ReviewDTO) {
    const url = `${window.location.origin}/avaliar/${review.token}`
    navigator.clipboard.writeText(url).then(
      () => toast.success("Link de avaliação copiado"),
      () => toast.error("Não foi possível copiar o link")
    )
  }

  function submitSettings() {
    startTransition(async () => {
      const result = await saveReviewSettings({
        salonId,
        isEnabled,
        title: title.trim() || null,
        welcomeText: welcomeText.trim() || null,
        thanksText: thanksText.trim() || null,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Configurações salvas")
      setSettingsOpen(false)
      router.refresh()
    })
  }

  function confirmDelete() {
    const review = toDelete
    if (!review) return
    startTransition(async () => {
      const result = await deleteReview({ salonId, reviewId: review.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Avaliação excluída")
      setToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Star size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Avaliações</h2>
            <p className="text-xs text-muted-foreground">
              A nota que o cliente dá ao atendimento, por um link. O pedido nasce quando a comanda com serviço é
              faturada.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button variant="outline" onClick={() => setSettingsOpen(true)} disabled={isPending}>
            <Settings size={16} />
            Personalizar
          </Button>
        )}
      </div>

      {!data.settings.isEnabled && (
        <p role="status" className="bg-amber-500/10 border border-amber-500/30 rounded-md p-3 text-xs text-foreground">
          Os pedidos de avaliação estão desativados: as comandas faturadas não geram link. Ative em Personalizar.
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 bg-card p-3 rounded-md border border-border">
        <div className="flex flex-col gap-1">
          <label htmlFor="reviews-from" className={labelClass}>
            De
          </label>
          <input
            id="reviews-from"
            type="date"
            defaultValue={data.from}
            disabled={isPending}
            onChange={(event) => {
              // Campo limpo não navega: o servidor cairia no mês corrente e o campo
              // voltaria preenchido, sem o usuário entender por quê.
              if (event.target.value) navigate({ from: event.target.value, to: data.to })
            }}
            className={controlClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="reviews-to" className={labelClass}>
            Até
          </label>
          <input
            id="reviews-to"
            type="date"
            defaultValue={data.to}
            disabled={isPending}
            onChange={(event) => {
              if (event.target.value) navigate({ from: data.from, to: event.target.value })
            }}
            className={controlClass}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:pb-2.5">
          Atendimentos de {formatCalendarDate(data.from)} a {formatCalendarDate(data.to)}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Média"
          value={dashboard.average === null ? "—" : dashboard.average.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
          hint="De 1 a 5"
        />
        <Stat
          label="Avaliações"
          value={String(dashboard.answered)}
          hint={`${dashboard.requested} ${dashboard.requested === 1 ? "pedido" : "pedidos"} no período`}
        />
        <Stat label="Taxa de resposta" value={`${dashboard.responseRate}%`} hint="Respondidas ÷ pedidas" />
        <Stat
          label="Tempo de resposta"
          value={responseTime(dashboard.averageResponseHours)}
          hint="Média entre o pedido e a resposta"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="bg-card border border-border rounded-md p-4" aria-labelledby="reviews-distribution">
          <h3 id="reviews-distribution" className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Distribuição por nota
          </h3>
          <ul className="flex flex-col gap-2">
            {[5, 4, 3, 2, 1].map((rating) => {
              const total = dashboard.distribution[rating - 1]
              return (
                <li key={rating} className="flex items-center gap-3 text-sm">
                  <span className="w-14 flex-shrink-0 text-muted-foreground tabular-nums">
                    {rating} {rating === 1 ? "estrela" : "estrelas"}
                  </span>
                  <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                    <span
                      className="block h-full rounded-full bg-amber-400"
                      style={{ width: `${(total * 100) / maxInDistribution}%` }}
                    />
                  </span>
                  <span className="w-8 flex-shrink-0 text-right tabular-nums font-semibold text-foreground">{total}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="bg-card border border-border rounded-md" aria-labelledby="reviews-professionals">
          <h3
            id="reviews-professionals"
            className="p-4 pb-0 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Por profissional
          </h3>
          {dashboard.professionals.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma avaliação respondida no período.</p>
          ) : (
            <table className="w-full text-sm mt-2">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-left font-semibold">Profissional</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Avaliações</th>
                  <th scope="col" className="px-4 py-2 text-right font-semibold">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dashboard.professionals.map((professional) => (
                  <tr key={professional.id}>
                    <th scope="row" className="px-4 py-2 text-left font-semibold text-foreground">
                      {professional.name}
                    </th>
                    <td className="px-4 py-2 text-right tabular-nums">{professional.answered}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-foreground">
                      {professional.average.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="bg-card border border-border rounded-md">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col lg:flex-row lg:items-center gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground lg:mr-auto">
            Pedidos e avaliações
          </h3>
          <input
            type="search"
            aria-label="Buscar por cliente"
            placeholder="Cliente"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={controlClass}
          />
          <select
            aria-label="Filtrar por situação"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className={controlClass}
          >
            <option value="all">Todas</option>
            <option value="answered">Respondidas</option>
            <option value="pending">Pendentes</option>
          </select>
          <select
            aria-label="Filtrar por nota"
            value={ratingFilter}
            onChange={(event) => setRatingFilter(Number(event.target.value))}
            className={controlClass}
          >
            <option value={0}>Qualquer nota</option>
            {[5, 4, 3, 2, 1].map((rating) => (
              <option key={rating} value={rating}>
                Nota {rating}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por profissional"
            value={professionalFilter}
            onChange={(event) => setProfessionalFilter(event.target.value)}
            className={controlClass}
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.reviews.length === 0
              ? "Nenhum pedido de avaliação no período."
              : "Nenhum pedido de avaliação com esses filtros."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Data</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Profissional</th>
                  <th scope="col" className="p-3 text-left font-semibold">Avaliação</th>
                  <th scope="col" className="p-3 text-left font-semibold">Comentário</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((review) => (
                  <tr key={review.id} className="align-top">
                    <td className="p-3 tabular-nums">
                      {formatCalendarDate(review.serviceDate)}
                      <Link
                        href={`/${salonId}/sales/${review.saleId}`}
                        className="block text-[11px] text-accent hover:underline"
                      >
                        Comanda #{review.saleNumber}
                      </Link>
                    </td>
                    <td className="p-3 font-semibold text-foreground">{review.customerName}</td>
                    <td className="p-3 text-muted-foreground">
                      {review.professionals.length === 0 ? "—" : review.professionals.map((p) => p.name).join(", ")}
                    </td>
                    <td className="p-3">
                      {review.rating === null ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          Pendente
                        </span>
                      ) : (
                        <Stars rating={review.rating} />
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground max-w-md whitespace-pre-wrap break-words">
                      {review.comment ?? "—"}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {review.rating === null && (
                          <button
                            type="button"
                            onClick={() => copyLink(review)}
                            aria-label={`Copiar o link de avaliação de ${review.customerName}`}
                            title="Copiar o link para enviar ao cliente"
                            className={iconButtonClass}
                          >
                            <Copy size={16} />
                          </button>
                        )}
                        {data.can.manage && (
                          <button
                            type="button"
                            onClick={() => setToDelete(review)}
                            disabled={isPending}
                            aria-label={`Excluir a avaliação de ${review.customerName}`}
                            className={iconButtonClass}
                          >
                            <Trash2 size={16} />
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
        <p className="p-3 border-t border-border text-xs text-muted-foreground">
          O link de cada pedido é copiado aqui ou na comanda e enviado ao cliente por quem atende; o envio automático
          ainda não existe. A nota de uma comanda conta para cada profissional que executou serviço nela.
          {data.truncated ? ` Mostrando os ${data.reviews.length} pedidos mais recentes do período.` : ""}
        </p>
      </section>

      {settingsOpen && (
        <Modal title="Personalizar avaliações" onClose={() => setSettingsOpen(false)} disabled={isPending}>
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={isPending}
                onChange={(event) => setIsEnabled(event.target.checked)}
              />
              Pedir avaliação (a comanda faturada com serviço gera um link)
            </label>
            <div className="flex flex-col gap-1">
              <label htmlFor="reviews-title" className={labelClass}>
                Título
              </label>
              <input
                id="reviews-title"
                type="text"
                maxLength={80}
                placeholder={data.defaults.title}
                value={title}
                disabled={isPending}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="reviews-welcome" className={labelClass}>
                Boas-vindas
              </label>
              <textarea
                id="reviews-welcome"
                rows={3}
                maxLength={300}
                placeholder={data.defaults.welcome}
                value={welcomeText}
                disabled={isPending}
                onChange={(event) => setWelcomeText(event.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="reviews-thanks" className={labelClass}>
                Agradecimento
              </label>
              <textarea
                id="reviews-thanks"
                rows={2}
                maxLength={300}
                placeholder={data.defaults.thanks}
                value={thanksText}
                disabled={isPending}
                onChange={(event) => setThanksText(event.target.value)}
                className={`${inputClass} resize-none`}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Em branco, o formulário usa o texto de exemplo. A nota (1 a 5) e o comentário opcional são fixos, e o
              rodapé mostra a data do atendimento.
            </p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setSettingsOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitSettings} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="Excluir avaliação"
        description={
          toDelete?.rating === null
            ? "O pedido sai da lista e o link deixa de funcionar. Esta ação não pode ser desfeita."
            : "A avaliação do cliente sai da lista e das médias. Esta ação não pode ser desfeita."
        }
        confirmText="Excluir"
        type="danger"
      />
    </div>
  )
}
