"use client"

import { useTransition, useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { FileText, Save, Globe, Building2, HelpCircle } from "lucide-react"
import {
  createSystemPromptTemplateSchema,
  type SystemPromptTemplateSchema,
} from "@/lib/schemas"
import type { SystemPromptTemplateRow } from "@/lib/types/system-prompt-template"
import {
  createSystemPromptTemplate,
  updateSystemPromptTemplate,
  getSystemPromptTemplate,
} from "@/app/actions/system-prompt-templates"
import { getUserSalons } from "@/app/actions/salon"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

interface TemplateFormDialogProps {
  salonId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onClose: () => void
  onSaved: (template: SystemPromptTemplateRow) => void
  initialData?: SystemPromptTemplateRow | null
}

function TemplateTypeTooltip() {
  const [isVisible, setIsVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const iconRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isVisible && iconRef.current) {
      const updatePosition = () => {
        if (iconRef.current) {
          const rect = iconRef.current.getBoundingClientRect()
          setPosition({
            top: rect.bottom + 8,
            left: rect.left,
          })
        }
      }
      
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true)
        window.removeEventListener('resize', updatePosition)
      }
    }
  }, [isVisible])

  const tooltipContent = isVisible && mounted ? (
    <div
      ref={tooltipRef}
      className="fixed w-80 px-4 py-3 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs rounded-lg shadow-lg border border-slate-300 dark:border-slate-700 z-[99999]"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <h4 className="font-bold text-sm mb-2 text-slate-900 dark:text-slate-100">Templates Globais vs Templates do Salão</h4>
      
      <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Templates Globais:</p>
          <p>Disponíveis para todos os salões (apenas administradores podem criar/editar).</p>
        </div>
        <div>
          <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Templates do Salão:</p>
          <p>Apenas para este salão (donos e gerentes podem criar/editar).</p>
        </div>
      </div>
      
      {/* Seta do tooltip */}
      <div className="absolute bottom-full left-4 -mb-1">
        <div className="w-2 h-2 bg-slate-200 dark:bg-slate-800 border-l border-t border-slate-300 dark:border-slate-700 rotate-45"></div>
      </div>
    </div>
  ) : null

  return (
    <>
      <HelpCircle
        ref={iconRef}
        size={14}
        className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-help transition-colors"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      />
      
      {mounted && tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  )
}

export function TemplateFormDialog({
  salonId,
  open,
  onOpenChange,
  onClose,
  onSaved,
  initialData,
}: TemplateFormDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [isGlobal, setIsGlobal] = useState(true) // Padrão: global
  const [userSalonsCount, setUserSalonsCount] = useState(0)
  const [isLoadingSalons, setIsLoadingSalons] = useState(false)

  const form = useForm<SystemPromptTemplateSchema>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createSystemPromptTemplateSchema as any),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      category: "",
      isActive: true,
      isGlobal: true, // Padrão: global
    },
    mode: "onChange",
  })

  // Carrega a quantidade de salões do usuário
  useEffect(() => {
    async function loadUserSalons() {
      if (!open) return
      
      setIsLoadingSalons(true)
      try {
        const salons = await getUserSalons()
        setUserSalonsCount(salons.length)
        
        // Se tiver apenas 1 salão, força como global
        if (salons.length <= 1) {
          setIsGlobal(true)
        }
      } catch (error) {
        console.error("Erro ao carregar salões:", error)
        // Em caso de erro, assume apenas 1 salão (seguro)
        setUserSalonsCount(1)
        setIsGlobal(true)
      } finally {
        setIsLoadingSalons(false)
      }
    }
    
    loadUserSalons()
  }, [open])

  // Atualiza o formulário quando initialData mudar
  useEffect(() => {
    if (initialData && open) {
      setIsGlobal(initialData.salonId === null)
      form.reset({
        name: initialData.name ?? "",
        description: initialData.description ?? "",
        systemPrompt: initialData.systemPrompt ?? "",
        category: initialData.category ?? "",
        isActive: initialData.isActive ?? true,
        isGlobal: initialData.salonId === null,
      })
    } else if (!initialData && open) {
      // Se tiver apenas 1 salão, força como global
      const shouldBeGlobal = userSalonsCount <= 1
      setIsGlobal(shouldBeGlobal)
      form.reset({
        name: "",
        description: "",
        systemPrompt: "",
        category: "",
        isActive: true,
        isGlobal: shouldBeGlobal,
      })
    }
  }, [initialData, open, form, userSalonsCount])

  async function onSubmit(values: SystemPromptTemplateSchema) {
    startTransition(async () => {
      if (initialData) {
        // Atualizar template existente
        const result = await updateSystemPromptTemplate(salonId, initialData.id, values)

        if ("error" in result) {
          toast.error(result.error)
          return
        }

        // Busca o template atualizado para retornar
        const updatedResult = await getSystemPromptTemplate(salonId, initialData.id)
        if ("data" in updatedResult && updatedResult.data) {
          toast.success("Template atualizado com sucesso")
          onSaved(updatedResult.data)
        } else {
          toast.success("Template atualizado com sucesso")
          onClose()
        }
      } else {
        // Criar novo template
        const result = await createSystemPromptTemplate(salonId, {
          ...values,
          isGlobal: isGlobal,
        })

        if ("error" in result) {
          toast.error(result.error)
          return
        }

        // Busca o template criado
        if ("data" in result && result.data) {
          const createdResult = await getSystemPromptTemplate(salonId, result.data.id)
          if ("data" in createdResult && createdResult.data) {
            toast.success("Template criado com sucesso")
            onSaved(createdResult.data)
          } else {
            toast.success("Template criado com sucesso")
            onClose()
          }
        } else {
          toast.success("Template criado com sucesso")
          onClose()
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[50vw] sm:!max-w-[50vw] max-h-[95vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10">
        <DialogHeader>
          <DialogTitle className="text-slate-800 dark:text-white">
            {initialData ? "Editar Template" : "Criar Novo Template"}
          </DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-400">
            {initialData
              ? "Atualize as informações do template de system prompt"
              : "Crie um novo template de system prompt para facilitar a configuração de agentes"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Tipo de Template (apenas na criação e se tiver mais de 1 salão) */}
          {!initialData && userSalonsCount > 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Tipo de Template
                </label>
                <TemplateTypeTooltip />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!isGlobal}
                    onChange={() => setIsGlobal(false)}
                    className="text-indigo-600"
                  />
                  <Building2 size={16} className="text-indigo-500" />
                  <span className="text-sm">Template do Salão</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={isGlobal}
                    onChange={() => setIsGlobal(true)}
                    className="text-indigo-600"
                  />
                  <Globe size={16} className="text-blue-500" />
                  <span className="text-sm">Template Global</span>
                </label>
              </div>
            </div>
          )}

          {initialData && initialData.salonId === null && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30">
              <Globe size={16} className="text-blue-500" />
              <span className="text-sm text-blue-700 dark:text-blue-300">Template Global</span>
            </div>
          )}

          {/* Nome */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nome do Template *
            </label>
            <input
              type="text"
              {...form.register("name")}
              placeholder="Ex.: Atendimento Básico"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Descrição (opcional)
            </label>
            <input
              type="text"
              {...form.register("description")}
              placeholder="Breve descrição do template"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {form.formState.errors.description && (
              <p className="text-xs text-red-500">{form.formState.errors.description.message}</p>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Categoria (opcional)
            </label>
            <input
              type="text"
              {...form.register("category")}
              placeholder="Ex.: Atendimento, Vendas, Suporte"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {form.formState.errors.category && (
              <p className="text-xs text-red-500">{form.formState.errors.category.message}</p>
            )}
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              System Prompt *
            </label>
            <textarea
              {...form.register("systemPrompt")}
              placeholder="Ex.: Você é um assistente do salão. Seja objetivo, confirme data/horário e peça nome/telefone quando necessário..."
              className="w-full min-h-[300px] bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-mono"
            />
            {form.formState.errors.systemPrompt && (
              <p className="text-xs text-red-500">{form.formState.errors.systemPrompt.message}</p>
            )}
          </div>

          {/* Ativo */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/5">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Template Ativo
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Templates inativos não aparecem no dropdown de seleção
              </p>
            </div>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Switch checked={!!field.value} onCheckedChange={(v) => field.onChange(v)} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isPending ? (
                "Salvando..."
              ) : (
                <>
                  <Save size={18} className="mr-2" />
                  {initialData ? "Salvar Alterações" : "Criar Template"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

