"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Plus, Globe, Building2, Pencil, Trash2, AlertCircle } from "lucide-react"
import type { SystemPromptTemplateRow } from "@/lib/types/system-prompt-template"
import { Button } from "@/components/ui/button"
import { deleteSystemPromptTemplate } from "@/app/actions/system-prompt-templates"
import { toast } from "sonner"
import { TemplatesList } from "./components/templates-list"
import { TemplateFormDialog } from "./components/template-form-dialog"

interface TemplatesClientProps {
  salonId: string
  initialTemplates: SystemPromptTemplateRow[]
}

export function TemplatesClient({ salonId, initialTemplates }: TemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<SystemPromptTemplateRow[]>(initialTemplates)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<SystemPromptTemplateRow | null>(null)

  const handleDelete = async (templateId: string) => {
    if (!confirm("Tem certeza que deseja excluir este template?")) {
      return
    }

    const result = await deleteSystemPromptTemplate(salonId, templateId)
    if ("error" in result) {
      toast.error(result.error)
      return
    }

    toast.success("Template excluído com sucesso")
    setTemplates(templates.filter((t) => t.id !== templateId))
    router.refresh()
  }

  const handleEdit = (template: SystemPromptTemplateRow) => {
    setEditingTemplate(template)
    setIsCreateDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsCreateDialogOpen(true)
  }

  const handleDialogClose = () => {
    setIsCreateDialogOpen(false)
    setEditingTemplate(null)
    router.refresh()
  }

  const handleTemplateSaved = (newTemplate: SystemPromptTemplateRow) => {
    if (editingTemplate) {
      // Atualiza template existente
      setTemplates(templates.map((t) => (t.id === newTemplate.id ? newTemplate : t)))
    } else {
      // Adiciona novo template
      setTemplates([...templates, newTemplate])
    }
    handleDialogClose()
  }

  const globalTemplates = templates.filter((t) => t.salonId === null)
  const salonTemplates = templates.filter((t) => t.salonId === salonId)

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
            Templates de System Prompts
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie templates pré-definidos de system prompts para facilitar a criação de agentes
          </p>
        </div>
        <Button
          onClick={handleCreate}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/20 px-5 py-2.5 flex items-center gap-2"
          type="button"
        >
          <Plus size={18} />
          Novo Template
        </Button>
      </div>

      {/* Info Box */}
      <div className="flex items-start gap-2 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30">
        <AlertCircle size={18} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-700 dark:text-blue-300">
          <p className="font-semibold mb-1">Templates Globais vs Templates do Salão</p>
          <p>
            <strong>Templates Globais:</strong> Disponíveis para todos os salões (apenas administradores podem criar/editar).
            <br />
            <strong>Templates do Salão:</strong> Apenas para este salão (donos e gerentes podem criar/editar).
          </p>
        </div>
      </div>

      {/* Templates List */}
      <TemplatesList
        globalTemplates={globalTemplates}
        salonTemplates={salonTemplates}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Create/Edit Dialog */}
      <TemplateFormDialog
        salonId={salonId}
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onClose={handleDialogClose}
        onSaved={handleTemplateSaved}
        initialData={editingTemplate}
      />
    </div>
  )
}

