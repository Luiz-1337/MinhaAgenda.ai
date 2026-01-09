"use client"

import { Globe, Building2, Pencil, Trash2, FileText } from "lucide-react"
import type { SystemPromptTemplateRow } from "@/lib/types/system-prompt-template"
import { Button } from "@/components/ui/button"

interface TemplatesListProps {
  globalTemplates: SystemPromptTemplateRow[]
  salonTemplates: SystemPromptTemplateRow[]
  onEdit: (template: SystemPromptTemplateRow) => void
  onDelete: (templateId: string) => void
}

export function TemplatesList({ globalTemplates, salonTemplates, onEdit, onDelete }: TemplatesListProps) {
  const renderTemplateCard = (template: SystemPromptTemplateRow, isGlobal: boolean) => (
    <div
      key={template.id}
      className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/5 p-5 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {isGlobal ? (
              <Globe size={16} className="text-blue-500" />
            ) : (
              <Building2 size={16} className="text-indigo-500" />
            )}
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">{template.name}</h3>
            {template.category && (
              <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                {template.category}
              </span>
            )}
            {isGlobal && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded font-medium">
                Global
              </span>
            )}
          </div>

          {template.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400">{template.description}</p>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-white/5">
            <p className="text-xs text-slate-500 dark:text-slate-500 line-clamp-3 font-mono bg-slate-50 dark:bg-slate-950/50 p-2 rounded">
              {template.systemPrompt}
            </p>
          </div>

          {!template.isActive && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Template inativo</p>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(template)}
            className="h-8 px-3 text-xs whitespace-nowrap"
            type="button"
          >
            <Pencil size={14} className="mr-1" />
            Editar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(template.id)}
            className="h-8 px-3 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 whitespace-nowrap"
            type="button"
          >
            <Trash2 size={14} className="mr-1" />
            Excluir
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
      {/* Templates Globais */}
      {globalTemplates.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-blue-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Templates Globais</h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">({globalTemplates.length})</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {globalTemplates.map((template) => renderTemplateCard(template, true))}
          </div>
        </div>
      )}

      {/* Templates do Salão */}
      {salonTemplates.length > 0 && (
        <div className="space-y-4">
          {globalTemplates.length > 0 && <div className="border-t border-slate-200 dark:border-white/5 pt-6" />}
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-indigo-500" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Templates do Salão</h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">({salonTemplates.length})</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {salonTemplates.map((template) => renderTemplateCard(template, false))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {globalTemplates.length === 0 && salonTemplates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText size={48} className="text-slate-400 dark:text-slate-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">
            Nenhum template encontrado
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Crie seu primeiro template de system prompt para facilitar a configuração de agentes.
          </p>
        </div>
      )}
    </div>
  )
}

