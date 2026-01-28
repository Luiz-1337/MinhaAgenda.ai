"use client"

import { useTransition, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Bot, MessageSquareText, BrainCircuit, Phone, Sparkles, Save, X, AlertCircle, HelpCircle, ArrowLeft, Cpu, AlertTriangle, FileText, Loader2 } from "lucide-react"
import { agentSchema, createAgentSchema, type AgentSchema } from "@/lib/schemas"
import { createAgent, updateAgent } from "@/app/actions/agents"
import { getSystemPromptTemplates, updateSystemPromptTemplate } from "@/app/actions/system-prompt-templates"
import type { SystemPromptTemplateRow } from "@/lib/types/system-prompt-template"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select"
import { ConfirmModal } from "@/components/ui/confirm-modal"

const AGENT_MODELS = [
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
] as const

function ToneTooltip() {
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
      <h4 className="font-bold text-sm mb-2 text-slate-900 dark:text-slate-100">Tipos de Tom</h4>
      
      {/* Tabela */}
      <div className="mb-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-300 dark:border-slate-700">
              <th className="text-left py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-300">Tom</th>
              <th className="text-left py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-300">Características</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200 dark:border-slate-700/50">
              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400 font-medium">Formal</td>
              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">Linguagem profissional e respeitosa</td>
            </tr>
            <tr>
              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400 font-medium">Informal</td>
              <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">Linguagem descontraída e amigável</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* Explicações */}
      <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
        <p><strong className="text-slate-700 dark:text-slate-300">Formal:</strong> Use para ambientes profissionais, clientes corporativos ou situações que exigem maior formalidade. O agente usará linguagem mais polida, evita gírias e mantém um tom respeitoso e profissional.</p>
        <p><strong className="text-slate-700 dark:text-slate-300">Informal:</strong> Ideal para criar uma conexão mais próxima com os clientes. O agente será mais descontraído, pode usar emojis ocasionalmente e terá uma comunicação mais natural e amigável.</p>
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
        size={12}
        className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-help transition-colors"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      />
      
      {mounted && tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  )
}

function ModelTooltip() {
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
          <h4 className="font-bold text-sm mb-2 text-slate-900 dark:text-slate-100">Pesos dos Modelos</h4>
          
          {/* Tabela */}
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-700">
                  <th className="text-left py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-300">Modelo</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-300">Tokens</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-200 dark:border-slate-700/50">
                  <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">GPT-5 Nano</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">Token * 0.2</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700/50">
                  <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">GPT-5 Mini</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">Token * 1.0</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700/50">
                  <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">GPT-5.1</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">Token * 5.0</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">GPT-5.2</td>
                  <td className="py-1.5 px-2 text-right font-mono text-slate-700 dark:text-slate-300">Token * 7.0</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Explicações */}
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            <p><strong className="text-slate-700 dark:text-slate-300">GPT-5 Nano:</strong> Modelo mais leve, ideal para tarefas simples. Consome 5x menos créditos que o modelo base.</p>
            <p><strong className="text-slate-700 dark:text-slate-300">GPT-5 Mini:</strong> Modelo padrão, balanceado entre qualidade e custo.</p>
            <p><strong className="text-slate-700 dark:text-slate-300">GPT-5.1:</strong> Modelo mais avançado, oferece melhor qualidade mas consome 5x mais créditos.</p>
            <p><strong className="text-slate-700 dark:text-slate-300">GPT-5.2 (7.0):</strong> Modelo mais potente, máxima qualidade mas consome 7x mais créditos que o modelo base.</p>
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
        size={12}
        className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 cursor-help transition-colors"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      />
      
      {mounted && tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  )
}

interface AgentFormProps {
  salonId: string
  mode: "create" | "edit"
  initialData?: Partial<AgentSchema> & { id?: string }
  onCancel?: () => void
}

export function AgentForm({ salonId, mode, initialData, onCancel }: AgentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [templates, setTemplates] = useState<SystemPromptTemplateRow[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<SystemPromptTemplateRow | null>(null)
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [hasPromptChanged, setHasPromptChanged] = useState(false)

  // Integrações WhatsApp (conectar/desconectar via Twilio Senders)
  const agentId = initialData?.id
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [whatsappNumbers, setWhatsappNumbers] = useState<{ phoneNumber: string; status: string; connectedAt: string; verifiedAt?: string }[]>([])
  const [whatsappLoading, setWhatsappLoading] = useState(false)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [verifyCode, setVerifyCode] = useState("")

  // Workaround: cast necessário devido a incompatibilidade entre @hookform/resolvers v5.2.x e Zod v4.1.x
  // Ver: https://github.com/react-hook-form/resolvers/issues/813
  const schema = mode === "create" ? createAgentSchema : agentSchema
  const form = useForm<AgentSchema>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any),
    defaultValues: {
      name: initialData?.name ?? "",
      systemPrompt: initialData?.systemPrompt ?? "",
      model: initialData?.model ?? "gpt-4o-mini",
      tone: initialData?.tone ?? "informal",
      whatsappNumber: initialData?.whatsappNumber ?? "",
      isActive: initialData?.isActive ?? false,
    },
    mode: "onChange",
  })

  // Carrega templates disponíveis
  useEffect(() => {
    async function loadTemplates() {
      setIsLoadingTemplates(true)
      const result = await getSystemPromptTemplates(salonId)
      if ("data" in result && result.data) {
        setTemplates(result.data)
      }
      setIsLoadingTemplates(false)
    }
    loadTemplates()
  }, [salonId])

  // Carrega status WhatsApp (Integrações) quando em modo edição
  useEffect(() => {
    if (!agentId || mode !== "edit") return
    let cancelled = false
    setWhatsappLoading(true)
    fetch(`/api/agents/${agentId}/whatsapp/status`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.numbers) ? data.numbers : []
        setWhatsappNumbers(list)
        if (list.length > 0) {
          form.setValue("whatsappNumber", list[0].phoneNumber)
        } else {
          form.setValue("whatsappNumber", "")
        }
      })
      .catch(() => { if (!cancelled) setWhatsappNumbers([]) })
      .finally(() => { if (!cancelled) setWhatsappLoading(false) })
    return () => { cancelled = true }
  }, [agentId, mode, form])

  // Atualiza o formulário quando initialData mudar (útil para duplicação)
  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name ?? "",
        systemPrompt: initialData.systemPrompt ?? "",
        model: initialData.model ?? "gpt-4o-mini",
        tone: initialData.tone ?? "informal",
        whatsappNumber: initialData.whatsappNumber ?? "",
        isActive: initialData.isActive ?? false,
      })
    }
  }, [initialData, form])

  // Monitora mudanças no systemPrompt
  const systemPromptValue = form.watch("systemPrompt")
  
  useEffect(() => {
    if (selectedTemplate) {
      const promptChanged = systemPromptValue !== selectedTemplate.systemPrompt
      setHasPromptChanged(promptChanged)
    } else {
      setHasPromptChanged(false)
    }
  }, [systemPromptValue, selectedTemplate])

  // Handler para quando um template é selecionado
  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      setSelectedTemplateId(templateId)
      setSelectedTemplate(template)
      form.setValue("systemPrompt", template.systemPrompt)
      setHasPromptChanged(false)
      toast.success(`Template "${template.name}" carregado`)
    }
  }

  // Handler para limpar seleção de template
  const handleClearTemplate = () => {
    setSelectedTemplateId(null)
    setSelectedTemplate(null)
    setHasPromptChanged(false)
    // Não limpa o campo, permite editar o prompt carregado
  }

  // Handler para salvar/atualizar template
  const handleSaveTemplate = async () => {
    if (!selectedTemplate || !selectedTemplateId) {
      return
    }

    setIsSavingTemplate(true)
    
    const result = await updateSystemPromptTemplate(salonId, selectedTemplateId, {
      systemPrompt: systemPromptValue,
    })

    if ("error" in result) {
      toast.error(result.error)
      setIsSavingTemplate(false)
      return
    }

    // Atualiza o template localmente
    const updatedTemplate = { ...selectedTemplate, systemPrompt: systemPromptValue }
    setSelectedTemplate(updatedTemplate)
    setTemplates(templates.map((t) => (t.id === selectedTemplateId ? updatedTemplate : t)))
    setHasPromptChanged(false)
    
    toast.success(`Template "${selectedTemplate.name}" atualizado com sucesso`)
    setIsSavingTemplate(false)
    router.refresh()
  }

  const isActive = form.watch("isActive")
  
  // Separa templates globais e do salão
  const globalTemplates = templates.filter((t) => t.salonId === null)
  const salonTemplates = templates.filter((t) => t.salonId === salonId)

  async function onSubmit(values: AgentSchema) {
    startTransition(async () => {
      if (mode === "create") {
        const res = await createAgent(salonId, values)

        if ("error" in res) {
          toast.error(res.error)
          return
        }

        toast.success("Agente criado com sucesso")
        router.push(`/${salonId}/agents`)
        router.refresh()
      } else {
        if (!initialData?.id) {
          toast.error("ID do agente não encontrado")
          return
        }

        const res = await updateAgent(salonId, initialData.id, values)

        if ("error" in res) {
          toast.error(res.error)
          return
        }

        toast.success("Agente atualizado com sucesso")
        router.push(`/${salonId}/agents`)
        router.refresh()
      }
    })
  }

  const handleBack = () => {
    if (onCancel) {
      onCancel()
    } else {
      router.push(`/${salonId}/agents`)
    }
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            disabled={isPending}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
              {mode === "create" ? "Criar Agente" : "Editar Agente"}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {mode === "create"
                ? "Configure um novo agente de IA para seu salão"
                : "Atualize as configurações do agente"}
            </p>
          </div>
        </div>
        <Button 
          type="submit" 
          form="agent-form"
          disabled={isPending}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/20 px-5 py-2.5 flex items-center gap-2"
        >
          {isPending ? (
            "Salvando..."
          ) : (
            <>
              <Save size={18} />
              {mode === "create" ? "Criar Agente" : "Salvar Alterações"}
            </>
          )}
        </Button>
      </div>

      {/* Form - Grid Layout */}
      <form id="agent-form" onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Coluna Esquerda - Configurações Rápidas (33%) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Card 1 - Informações Gerais */}
            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Informações Gerais</h3>
              </div>

              <div className="space-y-4">
                {/* Nome do Agente */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Nome do Agente
                  </label>
                  <input
                    type="text"
                    {...form.register("name")}
                    placeholder="Ex.: Assistente de Atendimento"
                    className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  {form.formState.errors.name && (
                    <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
                  )}
                </div>

                {/* Modelo e Tom - Lado a Lado */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Modelo</label>
                      <ModelTooltip />
                    </div>
                    <Controller
                      control={form.control}
                      name="model"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all h-9">
                            <SelectValue placeholder="Modelo" />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg">
                            {AGENT_MODELS.map((model) => (
                              <SelectItem
                                key={model.value}
                                value={model.value}
                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {form.formState.errors.model && (
                      <p className="text-xs text-red-500">{form.formState.errors.model.message}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tom</label>
                      <ToneTooltip />
                    </div>
                    <Controller
                      control={form.control}
                      name="tone"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all h-9">
                            <SelectValue placeholder="Tom" />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg">
                            <SelectItem value="formal" className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                              Formal
                            </SelectItem>
                            <SelectItem value="informal" className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                              Informal
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {form.formState.errors.tone && (
                      <p className="text-xs text-red-500">{form.formState.errors.tone.message}</p>
                    )}
                  </div>
                </div>

                {/* Toggle Agente Ativo */}
                <div className="pt-2 border-t border-slate-200 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Agente Ativo</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Ativa este agente e desativa os outros automaticamente
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
                  {isActive && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                      <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        <span>Ao salvar, outros agentes serão desativados</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2 - Integrações */}
            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/5 p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Phone size={18} className="text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Integrações</h3>
              </div>

              {(mode === "create" || !agentId) && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Salve o agente primeiro para conectar o WhatsApp.
                </p>
              )}

              {agentId && (mode === "edit") && (
                <>
                  {whatsappLoading && whatsappNumbers.length === 0 && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
                  )}

                  {!whatsappLoading && whatsappNumbers.length === 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Número do WhatsApp
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={whatsappPhoneInput}
                          onChange={(e) => setWhatsappPhoneInput(e.target.value)}
                          placeholder="Ex.: +5511986049295"
                          className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                        <button
                          type="button"
                          disabled={isConnecting}
                          onClick={async () => {
                            const raw = whatsappPhoneInput.replace(/\s/g, "").replace(/-/g, "").replace(/[()]/g, "").trim()
                            if (!/^\+[1-9]\d{10,14}$/.test(raw)) {
                              toast.error("Formato de número inválido. Use o formato +5511999999999")
                              return
                            }
                            setIsConnecting(true)
                            try {
                              const res = await fetch(`/api/agents/${agentId}/whatsapp/connect`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ phoneNumber: raw }),
                              })
                              const data = await res.json()
                              if (!res.ok) {
                                toast.error(data?.error || "Erro ao conectar")
                                return
                              }
                              const list = (await fetch(`/api/agents/${agentId}/whatsapp/status`).then((r) => r.json()))?.numbers || []
                              setWhatsappNumbers(list)
                              if (list.length > 0) form.setValue("whatsappNumber", list[0].phoneNumber)
                              toast.success("Número registrado! Você receberá um SMS. Use \"Verificar\" para completar.")
                            } catch {
                              toast.error("Erro de conexão. Tente novamente.")
                            } finally {
                              setIsConnecting(false)
                            }
                          }}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                        >
                          {isConnecting && <Loader2 size={16} className="animate-spin" />}
                          Conectar
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Formato: +5511999999999</p>
                    </div>
                  )}

                  {!whatsappLoading && whatsappNumbers.length > 0 && (() => {
                    const n = whatsappNumbers[0]
                    const st = (n?.status || "").toLowerCase()
                    const mask = (p: string) => {
                      const d = p.replace(/\D/g, "")
                      if (d.length >= 12 && p.startsWith("+55")) return `+55 ${d.slice(2, 4)} •••••-${d.slice(-4)}`
                      if (d.length >= 10) return `${p.slice(0, 6)} •••••-${p.slice(-4)}`
                      return p
                    }
                    const needVerify = st === "pending_verification" || st === "verifying"
                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{mask(n.phoneNumber)}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            st === "verified" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" :
                            st === "failed" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
                            "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          }`}>
                            {st === "verified" ? "Verificado" : st === "failed" ? "Falhou" : st === "verifying" ? "Verificando" : "Pendente"}
                          </span>
                        </div>
                        {needVerify && (
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Código recebido por SMS</label>
                              <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value)}
                                placeholder="123456"
                                className="mt-1 w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={isVerifying || !verifyCode.trim()}
                              onClick={async () => {
                                setIsVerifying(true)
                                try {
                                  const res = await fetch(`/api/agents/${agentId}/whatsapp/verify`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ phoneNumber: n.phoneNumber, verificationCode: verifyCode.trim() }),
                                  })
                                  const data = await res.json()
                                  if (!res.ok) {
                                    toast.error(data?.error || "Erro ao verificar")
                                    return
                                  }
                                  const list = (await fetch(`/api/agents/${agentId}/whatsapp/status`).then((r) => r.json()))?.numbers || []
                                  setWhatsappNumbers(list)
                                  setVerifyCode("")
                                  toast.success("Código enviado. O status será atualizado em breve.")
                                } catch {
                                  toast.error("Erro ao verificar. Tente novamente.")
                                } finally {
                                  setIsVerifying(false)
                                }
                              }}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                            >
                              {isVerifying && <Loader2 size={14} className="animate-spin" />}
                              Verificar
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setDisconnectModalOpen(true)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium"
                        >
                          Desconectar
                        </button>
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            <ConfirmModal
              open={disconnectModalOpen}
              onClose={() => setDisconnectModalOpen(false)}
              onConfirm={async () => {
                const n = whatsappNumbers[0]
                if (!n || !agentId) return
                try {
                  const res = await fetch(`/api/agents/${agentId}/whatsapp/disconnect`, {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phoneNumber: n.phoneNumber }),
                  })
                  const data = await res.json()
                  if (!res.ok) {
                    toast.error(data?.error || "Erro ao desconectar")
                    return
                  }
                  setWhatsappNumbers([])
                  form.setValue("whatsappNumber", "")
                  toast.success("Número desconectado com sucesso")
                } catch {
                  toast.error("Erro ao desconectar. Tente novamente.")
                }
              }}
              title="Desconectar WhatsApp"
              description="Tem certeza que deseja desconectar este número?"
              confirmText="Desconectar"
              type="danger"
            />
          </div>

          {/* Coluna Direita - System Prompt (66%) */}
          <div className="lg:col-span-8">
            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/5 p-6 shadow-sm flex flex-col h-full min-h-[600px]">
              <div className="flex items-center gap-2 mb-4">
                <Cpu size={18} className="text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">System Prompt</h3>
              </div>

              <div className="flex-1 flex flex-col space-y-3">
                {/* Dropdown de Templates */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Usar um Template (opcional)
                  </label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedTemplateId || undefined}
                      onValueChange={handleTemplateSelect}
                      disabled={isLoadingTemplates}
                    >
                      <SelectTrigger className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all h-9">
                        <SelectValue placeholder={isLoadingTemplates ? "Carregando templates..." : "Escolher um template..."} />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg shadow-lg max-h-[300px]">
                        {globalTemplates.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Templates Globais</SelectLabel>
                            {globalTemplates.map((template) => (
                              <SelectItem
                                key={template.id}
                                value={template.id}
                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{template.name}</span>
                                  {template.description && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{template.description}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        {salonTemplates.length > 0 && (
                          <>
                            {globalTemplates.length > 0 && <SelectSeparator />}
                            <SelectGroup>
                              <SelectLabel>Templates do Salão</SelectLabel>
                              {salonTemplates.map((template) => (
                                <SelectItem
                                  key={template.id}
                                  value={template.id}
                                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{template.name}</span>
                                    {template.description && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400">{template.description}</span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
                        {templates.length === 0 && !isLoadingTemplates && (
                          <SelectItem value="no-templates" disabled>
                            Nenhum template disponível
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {selectedTemplateId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleClearTemplate}
                        className="h-9 px-3"
                      >
                        Limpar
                      </Button>
                    )}
                  </div>
                  {selectedTemplateId && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <FileText size={12} />
                        {selectedTemplate && (
                          <>
                            Template: <span className="font-medium">{selectedTemplate.name}</span>
                            {hasPromptChanged && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                (modificado)
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      {hasPromptChanged && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveTemplate}
                          disabled={isSavingTemplate || isPending}
                          className="h-7 px-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          {isSavingTemplate ? "Salvando..." : "Salvar no Template"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Instruções do Agente
                    </label>
                    {selectedTemplateId && hasPromptChanged && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">
                        Você pode salvar as alterações no template acima
                      </span>
                    )}
                  </div>
                  <textarea
                    {...form.register("systemPrompt")}
                    placeholder="Ex.: Você é um assistente do salão. Seja objetivo, confirme data/horário e peça nome/telefone quando necessário..."
                    className="w-full h-full min-h-[500px] bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-mono"
                  />
                  {form.formState.errors.systemPrompt && (
                    <p className="text-xs text-red-500 mt-2">{form.formState.errors.systemPrompt.message}</p>
                  )}
                </div>

                {/* Footer do Card - Avisos */}
                <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-2">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30">
                    <AlertCircle size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-700 dark:text-blue-300">
                      <p className="font-semibold mb-1">Mudanças levam até 5 minutos para propagar</p>
                      <p>O prompt será enviado como system prompt base do agente</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <MessageSquareText size={14} />
                    <span>Este campo aceita formatação Markdown</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

