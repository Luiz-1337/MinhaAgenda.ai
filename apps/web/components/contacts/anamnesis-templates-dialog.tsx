"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { deleteAnamnesisTemplate, getAnamnesisTemplates, saveAnamnesisTemplate } from "@/app/actions/anamneses"
import {
  ANAMNESIS_LIMITS,
  ANAMNESIS_QUESTION_TYPES,
  ANAMNESIS_QUESTION_TYPE_LABELS,
  type AnamnesisQuestionType,
} from "@repo/db/src/domain/anamneses"
import type { AnamnesisTemplateRow } from "@repo/db"

type QuestionDraft = {
  /** Só para a lista da tela; não vai para o servidor. */
  key: number
  id?: string
  label: string
  type: AnamnesisQuestionType
  required: boolean
  /** Uma opção por linha. */
  options: string
}

type Draft = { templateId: string | null; name: string; isActive: boolean; questions: QuestionDraft[] }

const fieldClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
const labelClass = "text-[11px] uppercase font-semibold tracking-wider text-muted-foreground"

let nextKey = 1

function emptyQuestion(): QuestionDraft {
  return { key: nextKey++, label: "", type: "text", required: false, options: "" }
}

function toDraft(template: AnamnesisTemplateRow): Draft {
  return {
    templateId: template.id,
    name: template.name,
    isActive: template.isActive,
    questions: template.questions.map((question) => ({
      key: nextKey++,
      id: question.id,
      label: question.label,
      type: question.type,
      required: question.required,
      options: question.options.join("\n"),
    })),
  }
}

function hasOptions(type: AnamnesisQuestionType): boolean {
  return type === "single_choice" || type === "multiple_choice"
}

/**
 * Modelos de anamnese (docs/ROADMAP.md, fase 7, fatia 7d): criar, alterar,
 * desativar e excluir. Responder um modelo é na ficha do cliente.
 */
export function AnamnesisTemplatesDialog({
  open,
  onOpenChange,
  salonId,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  /** Chamado depois de salvar ou excluir: a ficha do cliente lista os modelos ativos. */
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const queryKey = ["anamnesis-templates", salonId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAnamnesisTemplates(salonId)
      if ("error" in result) throw new Error(result.error)
      return result.templates
    },
    enabled: open,
  })

  const templates = data ?? []

  function refresh() {
    void queryClient.invalidateQueries({ queryKey })
    onChanged?.()
  }

  function setQuestion(key: number, patch: Partial<QuestionDraft>) {
    setDraft((current) =>
      current
        ? { ...current, questions: current.questions.map((q) => (q.key === key ? { ...q, ...patch } : q)) }
        : current
    )
  }

  function moveQuestion(index: number, step: -1 | 1) {
    setDraft((current) => {
      if (!current) return current
      const target = index + step
      if (target < 0 || target >= current.questions.length) return current
      const questions = [...current.questions]
      ;[questions[index], questions[target]] = [questions[target], questions[index]]
      return { ...current, questions }
    })
  }

  function submit() {
    if (!draft) return
    startTransition(async () => {
      const result = await saveAnamnesisTemplate({
        salonId,
        templateId: draft.templateId,
        name: draft.name,
        isActive: draft.isActive,
        questions: draft.questions.map((question) => ({
          id: question.id,
          label: question.label,
          type: question.type,
          required: question.required,
          options: hasOptions(question.type) ? question.options.split("\n") : [],
        })),
      })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(draft.templateId ? "Modelo alterado" : "Modelo criado")
      setDraft(null)
      refresh()
    })
  }

  function remove(templateId: string) {
    startTransition(async () => {
      const result = await deleteAnamnesisTemplate({ salonId, templateId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Modelo excluído")
      setConfirmDeleteId(null)
      refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(null)
          setConfirmDeleteId(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="!max-w-2xl bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
        <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
          <div>
            <DialogTitle className="text-lg font-bold text-foreground tracking-tight">
              {draft ? (draft.templateId ? "Alterar modelo" : "Novo modelo") : "Modelos de anamnese"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {draft
                ? "Alterar o modelo não muda as fichas já respondidas."
                : "As perguntas que o salão faz ao cliente. Responder é na ficha do cliente."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {!draft ? (
          <>
            <div className="p-5 max-h-[55vh] overflow-y-auto custom-scrollbar">
              {isLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Carregando…
                </p>
              ) : isError ? (
                <p className="text-sm text-destructive">Não foi possível carregar os modelos.</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum modelo ainda.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {templates.map((template) => (
                    <li key={template.id} className="py-2.5 flex items-center gap-2 text-sm">
                      <div className="min-w-0 mr-auto">
                        <p className="text-foreground font-medium truncate">
                          {template.name}
                          {!template.isActive && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                              Inativo
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {template.questions.length} {template.questions.length === 1 ? "pergunta" : "perguntas"} ·{" "}
                          {template.filled} {template.filled === 1 ? "ficha respondida" : "fichas respondidas"}
                        </p>
                      </div>
                      {confirmDeleteId === template.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => remove(template.id)}
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
                        <>
                          <button
                            type="button"
                            onClick={() => setDraft(toDraft(template))}
                            disabled={isPending}
                            aria-label={`Alterar o modelo ${template.name}`}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(template.id)}
                            disabled={isPending}
                            aria-label={`Excluir o modelo ${template.name}`}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {confirmDeleteId && (
                <p className="mt-3 text-xs text-muted-foreground">
                  As fichas já respondidas com este modelo continuam na ficha dos clientes.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-border bg-muted/30 flex justify-end">
              <button
                type="button"
                onClick={() => setDraft({ templateId: null, name: "", isActive: true, questions: [emptyQuestion()] })}
                disabled={isPending || isLoading || isError}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md disabled:opacity-50"
              >
                <Plus size={16} /> Novo modelo
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar flex flex-col gap-4">
              <label className="block">
                <span className={labelClass}>Nome do modelo</span>
                <input
                  type="text"
                  value={draft.name}
                  maxLength={ANAMNESIS_LIMITS.name}
                  disabled={isPending}
                  placeholder="Ex.: Anamnese capilar"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  disabled={isPending}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                />
                Ativo (aparece para responder na ficha do cliente)
              </label>

              <ol className="flex flex-col gap-3">
                {draft.questions.map((question, index) => (
                  <li key={question.key} className="border border-border rounded-xl p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-1">
                      <span className={`${labelClass} mr-auto`}>Pergunta {index + 1}</span>
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, -1)}
                        disabled={isPending || index === 0}
                        aria-label={`Subir a pergunta ${index + 1}`}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(index, 1)}
                        disabled={isPending || index === draft.questions.length - 1}
                        aria-label={`Descer a pergunta ${index + 1}`}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, questions: draft.questions.filter((q) => q.key !== question.key) })
                        }
                        disabled={isPending || draft.questions.length === 1}
                        aria-label={`Remover a pergunta ${index + 1}`}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={question.label}
                      maxLength={ANAMNESIS_LIMITS.label}
                      disabled={isPending}
                      aria-label={`Texto da pergunta ${index + 1}`}
                      placeholder="Ex.: Tem alergia a algum produto?"
                      onChange={(event) => setQuestion(question.key, { label: event.target.value })}
                      className={fieldClass}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={question.type}
                        disabled={isPending}
                        aria-label={`Tipo da pergunta ${index + 1}`}
                        onChange={(event) =>
                          setQuestion(question.key, { type: event.target.value as AnamnesisQuestionType })
                        }
                        className={`${fieldClass} !w-auto`}
                      >
                        {ANAMNESIS_QUESTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {ANAMNESIS_QUESTION_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={question.required}
                          disabled={isPending}
                          onChange={(event) => setQuestion(question.key, { required: event.target.checked })}
                        />
                        Obrigatória
                      </label>
                    </div>
                    {hasOptions(question.type) && (
                      <label className="block">
                        <span className={labelClass}>Opções (uma por linha)</span>
                        <textarea
                          value={question.options}
                          rows={3}
                          disabled={isPending}
                          placeholder={"Oleoso\nSeco\nMisto"}
                          onChange={(event) => setQuestion(question.key, { options: event.target.value })}
                          className={`mt-1 ${fieldClass}`}
                        />
                      </label>
                    )}
                  </li>
                ))}
              </ol>

              <button
                type="button"
                onClick={() => setDraft({ ...draft, questions: [...draft.questions, emptyQuestion()] })}
                disabled={isPending || draft.questions.length >= ANAMNESIS_LIMITS.questions}
                className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline disabled:opacity-50"
              >
                <Plus size={13} /> Adicionar pergunta
              </button>
            </div>
            <div className="p-4 border-t border-border bg-muted/30 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={isPending}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md disabled:opacity-50"
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                {draft.templateId ? "Salvar" : "Criar modelo"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
