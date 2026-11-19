"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Copy, Eye, Loader2, Plus, Settings2, Trash2, X } from "lucide-react"
import {
  createCustomerDocument,
  deleteCustomerDocument,
  getCustomerDocument,
  getCustomerDocuments,
} from "@/app/actions/customer-documents"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { DocumentTemplatesDialog } from "@/components/contacts/document-templates-dialog"
import { useSalon } from "@/contexts/salon-context"
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from "@repo/db/src/domain/customer-documents"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const dayFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const fieldClass =
  "w-full bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-60"

const STATUS_CLASS: Record<DocumentStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  signed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  expired: "bg-muted text-muted-foreground",
}

function documentLink(token: string): string {
  return `${window.location.origin}/assinar/${token}`
}

function copyLink(token: string) {
  navigator.clipboard.writeText(documentLink(token)).then(
    () => toast.success("Link copiado. Envie ao cliente para ele assinar"),
    () => toast.error("Não foi possível copiar o link")
  )
}

/** O documento inteiro: o texto e, se assinado, a assinatura e o registro dela. */
function DocumentViewDialog({
  salonId,
  customerId,
  documentId,
  onClose,
}: {
  salonId: string
  customerId: string
  documentId: string | null
  onClose: () => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["customer-document", salonId, customerId, documentId],
    queryFn: async () => {
      const result = await getCustomerDocument({ salonId, customerId, documentId: documentId as string })
      if ("error" in result) throw new Error(result.error)
      return result.document
    },
    enabled: !!documentId,
  })

  return (
    <Dialog open={!!documentId} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="!max-w-2xl bg-card border-border p-0 overflow-hidden" showCloseButton={false}>
        <div className="p-5 border-b border-border flex justify-between items-center gap-3 bg-muted/50">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold text-foreground tracking-tight truncate">
              {data?.title ?? "Documento"}
            </DialogTitle>
            {data && <p className="text-xs text-muted-foreground">{DOCUMENT_STATUS_LABELS[data.status]}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 max-h-[65vh] overflow-y-auto custom-scrollbar flex flex-col gap-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </p>
          ) : isError || !data ? (
            <p className="text-sm text-destructive">Não foi possível carregar o documento.</p>
          ) : (
            <>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">{data.body}</p>

              {data.status === "signed" && data.signatureImage && (
                <div className="border-t border-border pt-4 flex flex-col gap-2">
                  {/* Data URL de PNG, validado no servidor ao assinar. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.signatureImage}
                    alt={`Assinatura de ${data.signerName ?? "cliente"}`}
                    className="h-28 w-full max-w-sm object-contain bg-white border border-border rounded-md"
                  />
                  <p className="text-sm text-foreground font-semibold">{data.signerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Assinado em {data.signedAt ? dateTimeFormat.format(new Date(data.signedAt)) : "—"}
                    {data.signerIp ? ` · IP ${data.signerIp}` : ""}
                  </p>
                  {data.signerUserAgent && (
                    <p className="text-xs text-muted-foreground break-words">Navegador: {data.signerUserAgent}</p>
                  )}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground break-all">
                Gerado em {dateTimeFormat.format(new Date(data.createdAt))} · SHA-256 do texto: {data.bodyHash}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Documentos na ficha do cliente (docs/ROADMAP.md, fase 7, fatia 7e): gerar um
 * documento a partir de um modelo, copiar o link para o cliente assinar e ver o
 * que foi assinado.
 *
 * Não renderiza NADA para quem não tem a permissão `customers.documents`. A trava
 * de verdade é o servidor.
 */
export function CustomerDocumentsCard({ salonId, customerId }: { salonId: string; customerId: string }) {
  const { activeSalon } = useSalon()
  const queryClient = useQueryClient()
  const [isPending, startTransition] = useTransition()

  const [templateId, setTemplateId] = useState("")
  const [viewId, setViewId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const enabled =
    !!activeSalon && activeSalon.id === salonId && activeSalon.permissions.includes("customers.documents")

  const queryKey = ["customer-documents", salonId, customerId]
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await getCustomerDocuments({ salonId, customerId })
      if ("error" in result) throw new Error(result.error)
      return result
    },
    enabled,
  })

  if (!enabled) return null

  const documents = data?.documents ?? []
  const templates = data?.templates ?? []
  // Com um modelo só, não há o que escolher.
  const chosenTemplateId = templates.length === 1 ? templates[0].id : templateId

  function refresh() {
    void queryClient.invalidateQueries({ queryKey })
  }

  function generate() {
    if (!chosenTemplateId) {
      toast.error("Escolha um modelo")
      return
    }
    startTransition(async () => {
      const result = await createCustomerDocument({ salonId, customerId, templateId: chosenTemplateId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setTemplateId("")
      refresh()
      if (result.data) copyLink(result.data.token)
    })
  }

  function remove(documentId: string) {
    startTransition(async () => {
      const result = await deleteCustomerDocument({ salonId, customerId, documentId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Documento excluído")
      setConfirmDeleteId(null)
      refresh()
    })
  }

  return (
    <section className="bg-card border border-border rounded-xl p-4" aria-labelledby="customer-documents-title">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="customer-documents-title" className="text-sm font-bold text-foreground">
          Documentos
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
        <p className="text-sm text-destructive py-2">Não foi possível carregar os documentos.</p>
      ) : (
        <>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              O salão não tem modelo de documento ativo. Use Modelos para criar ou ativar um.
            </p>
          ) : (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {templates.length > 1 && (
                <select
                  value={templateId}
                  disabled={isPending}
                  aria-label="Modelo de documento para gerar"
                  onChange={(event) => setTemplateId(event.target.value)}
                  className={`${fieldClass} !w-auto max-w-full`}
                >
                  <option value="">Escolha um modelo…</option>
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
              <Button onClick={generate} loading={isPending}>
                <Plus size={16} /> {templates.length === 1 ? `Gerar: ${templates[0].name}` : "Gerar documento"}
              </Button>
            </div>
          )}

          {documents.length === 0 ? (
            templates.length > 0 && (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum documento ainda. Gere um e envie o link ao cliente para ele assinar.
              </p>
            )
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((document) => {
                const canDelete = document.status !== "signed" || !!data?.can.deleteSigned
                return (
                  <li key={document.id} className="py-2.5 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 mr-auto">
                      <p className="text-sm text-foreground truncate">
                        {document.title}
                        <span
                          className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_CLASS[document.status]}`}
                        >
                          {DOCUMENT_STATUS_LABELS[document.status]}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {document.status === "signed" && document.signedAt
                          ? `Assinado em ${dateTimeFormat.format(new Date(document.signedAt))} por ${document.signerName}`
                          : `Gerado em ${dateTimeFormat.format(new Date(document.createdAt))} · ${
                              document.createdByName ?? "Autor removido"
                            } · ${document.status === "expired" ? "venceu" : "vale até"} ${dayFormat.format(
                              new Date(document.expiresAt)
                            )}`}
                      </p>
                    </div>

                    {confirmDeleteId === document.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(document.id)}
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
                        {document.token && (
                          <button
                            type="button"
                            onClick={() => copyLink(document.token as string)}
                            disabled={isPending}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold text-accent hover:bg-muted disabled:opacity-50"
                          >
                            <Copy size={13} /> Copiar link
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setViewId(document.id)}
                          disabled={isPending}
                          aria-label={`Ver o documento ${document.title}`}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          <Eye size={14} />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(document.id)}
                            disabled={isPending}
                            aria-label={`Excluir o documento ${document.title}`}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <DocumentViewDialog salonId={salonId} customerId={customerId} documentId={viewId} onClose={() => setViewId(null)} />

      <DocumentTemplatesDialog
        open={templatesOpen}
        onOpenChange={setTemplatesOpen}
        salonId={salonId}
        onChanged={refresh}
      />
    </section>
  )
}
