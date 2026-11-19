"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { deleteDocumentTemplate, getDocumentTemplates, saveDocumentTemplate } from "@/app/actions/customer-documents"
import { DOCUMENT_FIELDS, DOCUMENT_LIMITS } from "@repo/db/src/domain/customer-documents"
import type { DocumentTemplateRow } from "@repo/db"

type Draft = { templateId: string | null; name: string; body: string; isActive: boolean }

const fieldClass =
  "w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
const labelClass = "text-[11px] uppercase font-semibold tracking-wider text-muted-foreground"

function toDraft(template: DocumentTemplateRow): Draft {
  return { templateId: template.id, name: template.name, body: template.body, isActive: template.isActive }
}

/**
 * Modelos de documento (docs/ROADMAP.md, fase 7, fatia 7e): criar, alterar,
 * desativar e excluir. Gerar um documento para assinar é na ficha do cliente.
 */
export function DocumentTemplatesDialog({
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

  const queryKey = ["document-templates", salonId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getDocumentTemplates(salonId)
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

  function submit() {
    if (!draft) return
    startTransition(async () => {
      const result = await saveDocumentTemplate({
        salonId,
        templateId: draft.templateId,
        name: draft.name,
        body: draft.body,
        isActive: draft.isActive,
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
      const result = await deleteDocumentTemplate({ salonId, templateId })
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
              {draft ? (draft.templateId ? "Alterar modelo" : "Novo modelo") : "Modelos de documento"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {draft
                ? "Alterar o modelo não muda os documentos já gerados."
                : "Os termos que o salão pede para o cliente assinar. Gerar é na ficha do cliente."}
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
                          {template.generated}{" "}
                          {template.generated === 1 ? "documento gerado" : "documentos gerados"}
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
                  Os documentos já gerados com este modelo continuam na ficha dos clientes.
                </p>
              )}
            </div>
            <div className="p-4 border-t border-border bg-muted/30 flex justify-end">
              <button
                type="button"
                onClick={() => setDraft({ templateId: null, name: "", body: "", isActive: true })}
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
                  maxLength={DOCUMENT_LIMITS.name}
                  disabled={isPending}
                  placeholder="Ex.: Termo de consentimento — coloração"
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className={`mt-1 ${fieldClass}`}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  É o título que o cliente vê no documento.
                </span>
              </label>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  disabled={isPending}
                  onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
                />
                Ativo (aparece para gerar na ficha do cliente)
              </label>

              <label className="block">
                <span className={labelClass}>Texto do documento</span>
                <textarea
                  value={draft.body}
                  rows={12}
                  maxLength={DOCUMENT_LIMITS.body}
                  disabled={isPending}
                  placeholder={"Eu, {{cliente}}, declaro que fui informado(a) sobre o procedimento…\n\n{{salao}}, {{data}}."}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  className={`mt-1 ${fieldClass}`}
                />
              </label>

              <div className="text-xs text-muted-foreground">
                <p className="font-semibold">Campos preenchidos na hora de gerar o documento:</p>
                <ul className="mt-1 space-y-0.5">
                  {DOCUMENT_FIELDS.map((field) => (
                    <li key={field.key}>
                      <code className="text-foreground">{`{{${field.key}}}`}</code> — {field.label}
                    </li>
                  ))}
                </ul>
              </div>
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
