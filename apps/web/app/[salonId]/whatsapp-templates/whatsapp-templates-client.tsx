"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Plus,
  FileText,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Trash2,
  Send,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"
import { TemplateFormDialog } from "./components/template-form-dialog"
import { ConfirmModal } from "@/components/ui/confirm-modal"

interface WhatsAppTemplate {
  id: string
  name: string
  language: string
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION"
  body: string
  header?: string | null
  footer?: string | null
  buttons?: string | null
  twilioContentSid?: string | null
  status: "draft" | "pending" | "approved" | "rejected"
  rejectionReason?: string | null
  submittedAt?: string | null
  approvedAt?: string | null
  createdAt: string
}

interface WhatsAppTemplatesClientProps {
  salonId: string
}

export function WhatsAppTemplatesClient({ salonId }: WhatsAppTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Fetch templates
  useEffect(() => {
    fetchTemplates()
  }, [salonId])

  async function fetchTemplates() {
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/templates`)
      const data = await res.json()
      if (res.ok && data.data) {
        setTemplates(data.data)
      }
    } catch {
      toast.error("Erro ao carregar templates")
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitForApproval(template: WhatsAppTemplate) {
    if (template.status !== "draft" && template.status !== "rejected") {
      return
    }

    setActionLoading(template.id)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/templates/${template.id}`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Erro ao submeter template")
        return
      }
      toast.success("Template submetido para aprovação!")
      fetchTemplates()
    } catch {
      toast.error("Erro ao submeter template")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRefreshStatus(template: WhatsAppTemplate) {
    if (template.status !== "pending") {
      return
    }

    setActionLoading(template.id)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/templates/${template.id}`)
      const data = await res.json()
      if (res.ok && data.data) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === template.id ? data.data : t))
        )
        if (data.data.status === "approved") {
          toast.success("Template aprovado!")
        } else if (data.data.status === "rejected") {
          toast.error("Template rejeitado: " + (data.data.rejectionReason || "Motivo não informado"))
        }
      }
    } catch {
      toast.error("Erro ao atualizar status")
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete() {
    if (!selectedTemplate) return

    setActionLoading(selectedTemplate.id)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/templates/${selectedTemplate.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Erro ao remover template")
        return
      }
      toast.success("Template removido!")
      setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id))
      setDeleteModalOpen(false)
      setSelectedTemplate(null)
    } catch {
      toast.error("Erro ao remover template")
    } finally {
      setActionLoading(null)
    }
  }

  function getStatusBadge(status: WhatsAppTemplate["status"]) {
    switch (status) {
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <FileText size={12} />
            Rascunho
          </span>
        )
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Clock size={12} />
            Aguardando
          </span>
        )
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <CheckCircle size={12} />
            Aprovado
          </span>
        )
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            <XCircle size={12} />
            Rejeitado
          </span>
        )
    }
  }

  function getCategoryLabel(category: WhatsAppTemplate["category"]) {
    switch (category) {
      case "MARKETING":
        return "Marketing"
      case "UTILITY":
        return "Utilidade"
      case "AUTHENTICATION":
        return "Autenticação"
    }
  }

  return (
    <div className="flex flex-col h-full gap-6 pt-[5px] pr-[5px] pl-[5px]">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
            Templates WhatsApp
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie templates de mensagens para conversas iniciadas pelo negócio
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
        >
          <Plus size={16} />
          Criar template
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <p className="font-medium mb-1">Sobre templates HSM</p>
            <p className="text-blue-600 dark:text-blue-400">
              Templates são obrigatórios para iniciar conversas com clientes fora da janela de 24 horas.
              Cada template precisa ser aprovado pelo WhatsApp (geralmente leva de minutos a algumas horas).
            </p>
          </div>
        </div>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="animate-spin text-slate-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <FileText size={48} className="mb-4 opacity-50" />
          <p className="text-lg font-medium">Nenhum template criado</p>
          <p className="text-sm mb-4">Crie seu primeiro template para começar a enviar mensagens</p>
          <button
            onClick={() => setFormOpen(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Criar template
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-white/5 rounded-xl p-5"
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base font-bold text-slate-800 dark:text-white">
                      {template.name}
                    </h3>
                    {getStatusBadge(template.status)}
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {getCategoryLabel(template.category)}
                    </span>
                    <span className="text-xs text-slate-500">{template.language}</span>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {template.header && (
                      <p className="font-medium mb-1">{template.header}</p>
                    )}
                    {template.body}
                    {template.footer && (
                      <p className="text-slate-500 dark:text-slate-400 mt-2 text-xs">
                        {template.footer}
                      </p>
                    )}
                  </div>

                  {template.rejectionReason && (
                    <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
                      <XCircle size={14} className="flex-shrink-0 mt-0.5" />
                      <span>Motivo: {template.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {(template.status === "draft" || template.status === "rejected") && (
                    <button
                      onClick={() => handleSubmitForApproval(template)}
                      disabled={actionLoading === template.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {actionLoading === template.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                      Submeter
                    </button>
                  )}

                  {template.status === "pending" && (
                    <button
                      onClick={() => handleRefreshStatus(template)}
                      disabled={actionLoading === template.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {actionLoading === template.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      Atualizar
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setSelectedTemplate(template)
                      setDeleteModalOpen(true)
                    }}
                    disabled={actionLoading === template.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <TemplateFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        salonId={salonId}
        onSuccess={() => {
          setFormOpen(false)
          fetchTemplates()
        }}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
          setSelectedTemplate(null)
        }}
        onConfirm={handleDelete}
        title="Remover template"
        description={`Tem certeza que deseja remover o template "${selectedTemplate?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Remover"
        type="danger"
      />
    </div>
  )
}
