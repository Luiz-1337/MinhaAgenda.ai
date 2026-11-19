"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Plus, Settings2, Trash2 } from "lucide-react"
import { deleteCustomerAnamnesis, fillCustomerAnamnesis, getCustomerAnamneses } from "@/app/actions/anamneses"
import { Button } from "@/components/ui/button"
import { AnamnesisTemplatesDialog } from "@/components/contacts/anamnesis-templates-dialog"
import { useSalon } from "@/contexts/salon-context"
import { ANAMNESIS_LIMITS, formatAnamnesisAnswer, type AnamnesisQuestion } from "@repo/db/src/domain/anamneses"

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const fieldClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"

type AnswerDraft = string | string[] | boolean | null

function QuestionField({
  question,
  value,
  disabled,
  onChange,
}: {
  question: AnamnesisQuestion
  value: AnswerDraft
  disabled: boolean
  onChange: (value: AnswerDraft) => void
}) {
  const name = `anamnesis-${question.id}`

  if (question.type === "text") {
    return (
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        maxLength={ANAMNESIS_LIMITS.text}
        disabled={disabled}
        aria-label={question.label}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    )
  }

  if (question.type === "long_text") {
    return (
      <textarea
        value={typeof value === "string" ? value : ""}
        maxLength={ANAMNESIS_LIMITS.longText}
        rows={3}
        disabled={disabled}
        aria-label={question.label}
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      />
    )
  }

  if (question.type === "yes_no") {
    return (
      <div role="radiogroup" aria-label={question.label} className="flex gap-4">
        {[true, false].map((option) => (
          <label key={String(option)} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            {option ? "Sim" : "Não"}
          </label>
        ))}
      </div>
    )
  }

  if (question.type === "single_choice") {
    return (
      <div role="radiogroup" aria-label={question.label} className="flex flex-col gap-1.5">
        {question.options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={name}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            {option}
          </label>
        ))}
      </div>
    )
  }

  const chosen = Array.isArray(value) ? value : []
  return (
    <div role="group" aria-label={question.label} className="flex flex-col gap-1.5">
      {question.options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={chosen.includes(option)}
            disabled={disabled}
            onChange={(event) =>
              onChange(event.target.checked ? [...chosen, option] : chosen.filter((item) => item !== option))
            }
          />
          {option}
        </label>
      ))}
    </div>
  )
}

/**
 * Anamneses na ficha do cliente (docs/ROADMAP.md, fase 7, fatia 7d): o histórico
 * das fichas respondidas e o formulário para responder um modelo.
 *
 * Não renderiza NADA para quem não tem a permissão `customers.anamneses` — é dado
 * de saúde, e ter acesso aos contatos não basta. A trava de verdade é o servidor.
 */
export function CustomerAnamnesesCard({ salonId, customerId }: { salonId: string; customerId: string }) {
  const { activeSalon } = useSalon()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  const [templateId, setTemplateId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, AnswerDraft>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const enabled =
    !!activeSalon && activeSalon.id === salonId && activeSalon.permissions.includes("customers.anamneses")

  const queryKey = ["customer-anamneses", salonId, customerId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getCustomerAnamneses({ salonId, customerId })
      if ("error" in result) throw new Error(result.error)
      return result
    },
    enabled,
  })

  if (!enabled) return null

  const anamneses = data?.anamneses ?? []
  const templates = data?.templates ?? []
  const template = templates.find((item) => item.id === templateId) ?? null

  function refresh() {
    void queryClient.invalidateQueries({ queryKey })
  }

  function startFilling(id: string) {
    setTemplateId(id)
    setAnswers({})
  }

  function submit() {
    if (!template) return
    startTransition(async () => {
      const result = await fillCustomerAnamnesis({ salonId, customerId, templateId: template.id, answers })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Anamnese salva")
      setTemplateId(null)
      setAnswers({})
      refresh()
    })
  }

  function remove(anamnesisId: string) {
    startTransition(async () => {
      const result = await deleteCustomerAnamnesis({ salonId, customerId, anamnesisId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Anamnese excluída")
      setConfirmDeleteId(null)
      refresh()
    })
  }

  return (
    <section className="bg-card border border-border rounded-xl p-4" aria-labelledby="customer-anamneses-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="customer-anamneses-title" className="text-sm font-bold text-foreground">
          Anamneses
        </h3>
        <button
          type="button"
          onClick={() => setTemplatesOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          <Settings2 size={13} />
          Modelos
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Carregando…</p>
      ) : isError ? (
        <p className="text-sm text-destructive py-2">Não foi possível carregar as anamneses.</p>
      ) : (
        <>
          {template ? (
            <div className="border border-border rounded-xl p-3 mb-3 flex flex-col gap-4">
              <p className="text-sm font-semibold text-foreground">{template.name}</p>
              {template.questions.map((question) => (
                <div key={question.id} className="flex flex-col gap-1.5">
                  <p className="text-sm text-foreground">
                    {question.label}
                    {question.required && (
                      <span className="text-destructive" title="Obrigatória">
                        {" "}
                        *
                      </span>
                    )}
                  </p>
                  <QuestionField
                    question={question}
                    value={answers[question.id] ?? null}
                    disabled={isPending}
                    onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTemplateId(null)} disabled={isPending}>
                  Cancelar
                </Button>
                <Button onClick={submit} loading={isPending}>
                  Salvar anamnese
                </Button>
              </div>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              O salão ainda não tem modelo de anamnese ativo. Use Modelos para criar o primeiro.
            </p>
          ) : (
            <div className="mb-3">
              {templates.length === 1 ? (
                <Button onClick={() => startFilling(templates[0].id)}>
                  <Plus size={16} /> Responder: {templates[0].name}
                </Button>
              ) : (
                <select
                  defaultValue=""
                  aria-label="Modelo de anamnese para responder"
                  onChange={(event) => {
                    if (event.target.value) startFilling(event.target.value)
                  }}
                  className={fieldClass}
                >
                  <option value="">Responder um modelo…</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {anamneses.length === 0 ? (
            !template && templates.length > 0 && (
              <p className="text-sm text-muted-foreground py-2">Nenhuma anamnese respondida ainda.</p>
            )
          ) : (
            <ul className="divide-y divide-border">
              {anamneses.map((anamnesis) => {
                const isOpen = openId === anamnesis.id
                return (
                  <li key={anamnesis.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : anamnesis.id)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-2 min-w-0 mr-auto text-left"
                      >
                        {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span className="min-w-0">
                          <span className="block text-sm text-foreground truncate">{anamnesis.templateName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {dateFormat.format(new Date(anamnesis.createdAt))} ·{" "}
                            {anamnesis.filledByName ?? "Autor removido"}
                          </span>
                        </span>
                      </button>
                      {data?.can.delete &&
                        (confirmDeleteId === anamnesis.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => remove(anamnesis.id)}
                              disabled={isPending}
                              className="px-2 py-1 rounded text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              Excluir mesmo
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={isPending}
                              className="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                            >
                              Voltar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(anamnesis.id)}
                            disabled={isPending}
                            aria-label={`Excluir a anamnese ${anamnesis.templateName}`}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        ))}
                    </div>
                    {isOpen && (
                      <dl className="mt-2 ml-6 space-y-2">
                        {anamnesis.answers.map((answer, index) => (
                          <div key={`${answer.questionId}-${index}`}>
                            <dt className="text-xs font-semibold text-muted-foreground">{answer.label}</dt>
                            <dd className="text-sm text-foreground whitespace-pre-wrap break-words">
                              {formatAnamnesisAnswer(answer.value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <AnamnesisTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        salonId={salonId}
        onChanged={refresh}
      />
    </section>
  )
}
