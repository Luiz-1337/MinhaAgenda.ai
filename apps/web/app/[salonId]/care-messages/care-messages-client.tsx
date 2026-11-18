"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HeartHandshake, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmModal } from "@/components/ui/confirm-modal"
import { cancelCareMessageDispatch, deleteCareMessageRule, saveCareMessageRule } from "@/app/actions/care-messages"
import type { CareMessageDispatchDTO, CareMessageRuleDTO, CareMessagesDTO } from "@/lib/types/care-messages"
import { Modal, controlClass, iconButtonClass, inputClass, labelClass } from "../inventory/inventory-ui"

type RuleKind = CareMessageRuleDTO["kind"]
type DispatchStatus = CareMessageDispatchDTO["status"]

const KIND_LABEL: Record<CareMessageDispatchDTO["kind"], string> = {
  pre_care: "Cuidados antes",
  post_care: "Cuidados depois",
  return: "Retorno",
  review: "Pedido de avaliação",
}

const STATUS_LABEL: Record<DispatchStatus, string> = {
  pending: "Na fila",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Não enviada",
}

const STATUS_CLASS: Record<DispatchStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sent: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  failed: "bg-red-500/10 text-red-700 dark:text-red-400",
  skipped: "bg-muted text-muted-foreground",
}

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

/** "3 dias antes do agendamento", "No dia da comanda", "30 dias depois da comanda". */
function describeWhen(kind: RuleKind, offsetDays: number): string {
  const days = `${offsetDays} ${offsetDays === 1 ? "dia" : "dias"}`
  if (kind === "pre_care") return `${days} antes do agendamento`
  if (offsetDays === 0) return "No dia da comanda"
  return `${days} depois da comanda`
}

type Draft = {
  ruleId: string | null
  kind: RuleKind
  target: "service" | "product"
  itemId: string
  offsetDays: string
  message: string
  isActive: boolean
}

const EMPTY_DRAFT: Draft = {
  ruleId: null,
  kind: "post_care",
  target: "service",
  itemId: "",
  offsetDays: "0",
  message: "",
  isActive: true,
}

/**
 * Mensagens de cuidados e de retorno (docs/ROADMAP.md, fase 6, fatia 6d): o que o
 * salão diz ao cliente por serviço ou produto, e a lista do que saiu, do que
 * falhou e do que está na fila.
 */
export function CareMessagesClient({ salonId, data }: { salonId: string; data: CareMessagesDTO }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [ruleToDelete, setRuleToDelete] = useState<CareMessageRuleDTO | null>(null)
  const [dispatchToCancel, setDispatchToCancel] = useState<CareMessageDispatchDTO | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | DispatchStatus>("all")

  const visibleDispatches = useMemo(
    () => data.dispatches.filter((dispatch) => statusFilter === "all" || dispatch.status === statusFilter),
    [data.dispatches, statusFilter]
  )

  function openEdit(rule: CareMessageRuleDTO) {
    setDraft({
      ruleId: rule.id,
      kind: rule.kind,
      target: rule.serviceId ? "service" : "product",
      itemId: rule.serviceId ?? rule.productId ?? "",
      offsetDays: String(rule.offsetDays),
      message: rule.message,
      isActive: rule.isActive,
    })
  }

  function changeKind(kind: RuleKind) {
    setDraft((current) => {
      if (!current) return current
      const limits = data.limits[kind]
      const days = Number(current.offsetDays)
      const inRange = Number.isInteger(days) && days >= limits.min && days <= limits.max
      return {
        ...current,
        kind,
        // Cuidados de antes só existem para serviço.
        target: kind === "pre_care" ? "service" : current.target,
        itemId: kind === "pre_care" && current.target === "product" ? "" : current.itemId,
        offsetDays: inRange ? current.offsetDays : String(limits.min),
      }
    })
  }

  function submitRule() {
    if (!draft) return
    if (!draft.itemId) {
      toast.error(draft.target === "service" ? "Escolha o serviço" : "Escolha o produto")
      return
    }
    const offsetDays = Number(draft.offsetDays)
    if (!Number.isInteger(offsetDays)) {
      toast.error("Informe os dias em número inteiro")
      return
    }

    startTransition(async () => {
      const result = await saveCareMessageRule({
        salonId,
        ruleId: draft.ruleId,
        kind: draft.kind,
        serviceId: draft.target === "service" ? draft.itemId : null,
        productId: draft.target === "product" ? draft.itemId : null,
        offsetDays,
        message: draft.message,
        isActive: draft.isActive,
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Mensagem salva")
      setDraft(null)
      router.refresh()
    })
  }

  function confirmDeleteRule() {
    const rule = ruleToDelete
    if (!rule) return
    startTransition(async () => {
      const result = await deleteCareMessageRule({ salonId, ruleId: rule.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Mensagem excluída")
      setRuleToDelete(null)
      router.refresh()
    })
  }

  function confirmCancelDispatch() {
    const dispatch = dispatchToCancel
    if (!dispatch) return
    startTransition(async () => {
      const result = await cancelCareMessageDispatch({ salonId, dispatchId: dispatch.id })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Envio cancelado")
      setDispatchToCancel(null)
      router.refresh()
    })
  }

  const limits = draft ? data.limits[draft.kind] : null
  const itemOptions = draft?.target === "product" ? data.products : data.services

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto custom-scrollbar">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <HeartHandshake size={24} className="text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">Cuidados e retorno</h2>
            <p className="text-xs text-muted-foreground">
              Mensagens que o salão manda ao cliente pelo WhatsApp, por serviço ou produto: cuidados antes e depois do
              atendimento, e o convite para voltar.
            </p>
          </div>
        </div>
        {data.can.manage && (
          <Button onClick={() => setDraft({ ...EMPTY_DRAFT })} disabled={isPending}>
            <Plus size={16} />
            Nova mensagem
          </Button>
        )}
      </div>

      <section className="bg-card border border-border rounded-md" aria-labelledby="care-rules">
        <h3
          id="care-rules"
          className="p-3 border-b border-border bg-muted/50 text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          Mensagens
        </h3>
        {data.rules.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nenhuma mensagem cadastrada. Crie a primeira em “Nova mensagem”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Serviço ou produto</th>
                  <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                  <th scope="col" className="p-3 text-left font-semibold">Quando</th>
                  <th scope="col" className="p-3 text-left font-semibold">Mensagem</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 w-24"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.rules.map((rule) => (
                  <tr key={rule.id} className="align-top">
                    <th scope="row" className="p-3 text-left font-semibold text-foreground">
                      {rule.itemName}
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {rule.serviceId ? "Serviço" : "Produto"}
                      </span>
                    </th>
                    <td className="p-3">{KIND_LABEL[rule.kind]}</td>
                    <td className="p-3 text-muted-foreground">{describeWhen(rule.kind, rule.offsetDays)}</td>
                    <td className="p-3 text-muted-foreground max-w-md whitespace-pre-wrap break-words">{rule.message}</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          rule.isActive ? STATUS_CLASS.sent : STATUS_CLASS.skipped
                        }`}
                      >
                        {rule.isActive ? "Ativa" : "Desativada"}
                      </span>
                    </td>
                    <td className="p-3">
                      {data.can.manage && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(rule)}
                            disabled={isPending}
                            aria-label={`Alterar a mensagem de ${rule.itemName} (${KIND_LABEL[rule.kind]})`}
                            className={iconButtonClass}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRuleToDelete(rule)}
                            disabled={isPending}
                            aria-label={`Excluir a mensagem de ${rule.itemName} (${KIND_LABEL[rule.kind]})`}
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
          Cuidados de depois e retorno contam a partir da comanda faturada; cuidados de antes, a partir do agendamento.
          O retorno não sai para quem já tem horário marcado. Nada é enviado a quem pediu para não receber mensagens.
        </p>
      </section>

      <section className="bg-card border border-border rounded-md" aria-labelledby="care-dispatches">
        <div className="p-3 border-b border-border bg-muted/50 flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 id="care-dispatches" className="text-xs font-bold uppercase tracking-wider text-muted-foreground sm:mr-auto">
            Envios
          </h3>
          <select
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as "all" | DispatchStatus)}
            className={controlClass}
          >
            <option value="all">Todos</option>
            <option value="pending">Na fila</option>
            <option value="sent">Enviadas</option>
            <option value="failed">Falharam</option>
            <option value="skipped">Não enviadas</option>
          </select>
        </div>
        {visibleDispatches.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {data.dispatches.length === 0 ? "Nenhum envio ainda." : "Nenhum envio com esse filtro."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="p-3 text-left font-semibold">Quando</th>
                  <th scope="col" className="p-3 text-left font-semibold">Cliente</th>
                  <th scope="col" className="p-3 text-left font-semibold">Tipo</th>
                  <th scope="col" className="p-3 text-left font-semibold">Situação</th>
                  <th scope="col" className="p-3 text-left font-semibold">Mensagem ou motivo</th>
                  <th scope="col" className="p-3 w-16"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleDispatches.map((dispatch) => (
                  <tr key={dispatch.id} className="align-top">
                    <td className="p-3 tabular-nums">
                      {dateTimeFormat.format(new Date(dispatch.sentAt ?? dispatch.scheduledFor))}
                      {dispatch.saleId && dispatch.saleNumber !== null && (
                        <Link
                          href={`/${salonId}/sales/${dispatch.saleId}`}
                          className="block text-[11px] text-accent hover:underline"
                        >
                          Comanda #{dispatch.saleNumber}
                        </Link>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-foreground">{dispatch.customerName}</td>
                    <td className="p-3">
                      {KIND_LABEL[dispatch.kind]}
                      {dispatch.itemName && (
                        <span className="block text-[11px] text-muted-foreground">{dispatch.itemName}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_CLASS[dispatch.status]}`}
                      >
                        {STATUS_LABEL[dispatch.status]}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-md whitespace-pre-wrap break-words">
                      {dispatch.detail ?? dispatch.body ?? "—"}
                    </td>
                    <td className="p-3">
                      {data.can.manage && dispatch.status === "pending" && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => setDispatchToCancel(dispatch)}
                            disabled={isPending}
                            aria-label={`Cancelar o envio para ${dispatch.customerName}`}
                            title="Cancelar o envio"
                            className={iconButtonClass}
                          >
                            <X size={16} />
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
          A fila envia a cada meia hora, das {data.sendHours.from}h às {data.sendHours.until}h. O que falha não é
          reenviado sozinho. O pedido de avaliação pelo WhatsApp (ativado em Avaliações) também aparece aqui.
          {data.truncated ? ` Mostrando os ${data.dispatches.length} envios mais recentes.` : ""}
        </p>
      </section>

      {draft && limits && (
        <Modal
          title={draft.ruleId ? "Alterar mensagem" : "Nova mensagem"}
          onClose={() => setDraft(null)}
          disabled={isPending}
        >
          <div className="p-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1">
              <label htmlFor="care-kind" className={labelClass}>
                Tipo
              </label>
              <select
                id="care-kind"
                value={draft.kind}
                disabled={isPending}
                onChange={(event) => changeKind(event.target.value as RuleKind)}
                className={inputClass}
              >
                <option value="pre_care">Cuidados antes do atendimento</option>
                <option value="post_care">Cuidados depois do atendimento</option>
                <option value="return">Retorno</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="care-target" className={labelClass}>
                  Vale para
                </label>
                <select
                  id="care-target"
                  value={draft.target}
                  disabled={isPending || draft.kind === "pre_care"}
                  onChange={(event) =>
                    setDraft({ ...draft, target: event.target.value as "service" | "product", itemId: "" })
                  }
                  className={inputClass}
                >
                  <option value="service">Serviço</option>
                  <option value="product">Produto</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="care-item" className={labelClass}>
                  {draft.target === "service" ? "Serviço" : "Produto"}
                </label>
                <select
                  id="care-item"
                  value={draft.itemId}
                  disabled={isPending}
                  onChange={(event) => setDraft({ ...draft, itemId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Selecione…</option>
                  {itemOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="care-days" className={labelClass}>
                {draft.kind === "pre_care" ? "Dias antes do agendamento" : "Dias depois da comanda"}
              </label>
              <input
                id="care-days"
                type="number"
                inputMode="numeric"
                min={limits.min}
                max={limits.max}
                step={1}
                value={draft.offsetDays}
                disabled={isPending}
                onChange={(event) => setDraft({ ...draft, offsetDays: event.target.value })}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">
                De {limits.min} a {limits.max}.
                {draft.kind === "post_care" ? " 0 = no mesmo dia, logo depois de faturar a comanda." : ""}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="care-message" className={labelClass}>
                Mensagem
              </label>
              <textarea
                id="care-message"
                rows={5}
                maxLength={1000}
                value={draft.message}
                disabled={isPending}
                onChange={(event) => setDraft({ ...draft, message: event.target.value })}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{cliente}"} para o primeiro nome do cliente, {"{item}"} para o serviço ou produto e {"{salao}"}{" "}
                para o nome do salão.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={draft.isActive}
                disabled={isPending}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />
              Ativa
            </label>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border">
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitRule} disabled={isPending}>
              Salvar
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={ruleToDelete !== null}
        onClose={() => setRuleToDelete(null)}
        onConfirm={confirmDeleteRule}
        title="Excluir mensagem"
        description="A mensagem deixa de ser enviada, e o que estava na fila por causa dela é cancelado. O histórico dos envios já feitos fica."
        confirmText="Excluir"
        type="danger"
      />

      <ConfirmModal
        open={dispatchToCancel !== null}
        onClose={() => setDispatchToCancel(null)}
        onConfirm={confirmCancelDispatch}
        title="Cancelar envio"
        description="A mensagem sai da fila e não é enviada ao cliente."
        confirmText="Cancelar envio"
        type="danger"
      />
    </div>
  )
}
