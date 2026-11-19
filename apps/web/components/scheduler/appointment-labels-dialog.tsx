"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { deleteAppointmentLabel, getAppointmentLabels, saveAppointmentLabel } from "@/app/actions/appointment-labels"
import { APPOINTMENT_LABEL_COLORS, labelTextColor } from "@repo/db/src/domain/appointment-labels"

type Draft = { labelId: string | null; name: string; color: string }

const EMPTY_DRAFT: Draft = { labelId: null, name: "", color: APPOINTMENT_LABEL_COLORS[5] }

/**
 * Etiquetas da agenda (docs/ROADMAP.md, fase 7, fatia 7b): criar, renomear, trocar
 * a cor e excluir. Pôr a etiqueta num agendamento é no detalhe dele.
 */
export function AppointmentLabelsDialog({
  open,
  onOpenChange,
  salonId,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  /** Chamado depois de alterar ou excluir: a grade mostra nome e cor da etiqueta. */
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const queryKey = ["appointment-labels", salonId]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getAppointmentLabels(salonId)
      if ("error" in result) throw new Error(result.error)
      return result
    },
    enabled: open,
  })

  const labels = data?.labels ?? []
  const canManage = data?.can.manage ?? false

  function refresh() {
    void queryClient.invalidateQueries({ queryKey })
    onChanged()
  }

  function submit() {
    if (!draft.name.trim()) {
      toast.error("Dê um nome à etiqueta")
      return
    }
    startTransition(async () => {
      const result = await saveAppointmentLabel({ salonId, ...draft })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(draft.labelId ? "Etiqueta alterada" : "Etiqueta criada")
      setDraft(EMPTY_DRAFT)
      refresh()
    })
  }

  function remove(labelId: string) {
    startTransition(async () => {
      const result = await deleteAppointmentLabel({ salonId, labelId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Etiqueta excluída")
      setConfirmDeleteId(null)
      if (draft.labelId === labelId) setDraft(EMPTY_DRAFT)
      refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
        <div className="p-5 border-b border-border flex justify-between items-center bg-muted/50">
          <div>
            <DialogTitle className="text-lg font-bold text-foreground tracking-tight">Etiquetas da agenda</DialogTitle>
            <p className="text-xs text-muted-foreground">Um marcador com cor para o agendamento.</p>
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

        <div className="p-5 max-h-[45vh] overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </p>
          ) : labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma etiqueta ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {labels.map((label) => (
                <li key={label.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold truncate max-w-[55%]"
                    style={{ backgroundColor: label.color, color: labelTextColor(label.color) }}
                  >
                    {label.name}
                  </span>
                  <span className="text-xs text-muted-foreground mr-auto">
                    {label.appointments} {label.appointments === 1 ? "agendamento" : "agendamentos"}
                  </span>
                  {canManage &&
                    (confirmDeleteId === label.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(label.id)}
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
                          onClick={() => setDraft({ labelId: label.id, name: label.name, color: label.color })}
                          disabled={isPending}
                          aria-label={`Alterar a etiqueta ${label.name}`}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(label.id)}
                          disabled={isPending}
                          aria-label={`Excluir a etiqueta ${label.name}`}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <div className="p-4 border-t border-border bg-muted/30 flex flex-col gap-3">
            <label className="block">
              <span className="text-[11px] uppercase font-semibold tracking-wider text-muted-foreground">
                {draft.labelId ? "Alterar etiqueta" : "Nova etiqueta"}
              </span>
              <input
                type="text"
                value={draft.name}
                maxLength={30}
                disabled={isPending}
                placeholder="Ex.: Primeira vez"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground disabled:opacity-50"
              />
            </label>
            <div role="radiogroup" aria-label="Cor da etiqueta" className="flex flex-wrap gap-2">
              {APPOINTMENT_LABEL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === color}
                  aria-label={`Cor ${color}`}
                  disabled={isPending}
                  onClick={() => setDraft({ ...draft, color })}
                  className="h-7 w-7 rounded-full flex items-center justify-center border border-border disabled:opacity-50"
                  style={{ backgroundColor: color, color: labelTextColor(color) }}
                >
                  {draft.color === color && <Check size={14} />}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              {draft.labelId && (
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md disabled:opacity-50"
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                {draft.labelId ? "Salvar" : "Criar etiqueta"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
