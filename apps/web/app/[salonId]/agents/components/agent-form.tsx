"use client"

import { useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Bot, MessageSquareText, BrainCircuit, Phone, Sparkles, Save, X, AlertCircle } from "lucide-react"
import { agentSchema, type AgentSchema } from "@/lib/schemas"
import { createAgent, updateAgent } from "@/app/actions/agents"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const AGENT_MODELS = [
  { value: "gpt-5.2", label: "GPT-5.2" },
  { value: "gpt-5.1", label: "GPT-5.1" },
  { value: "gpt-5-mini", label: "GPT-5 Mini" },
  { value: "gpt-5-nano", label: "GPT-5 Nano" },
  { value: "gpt-4.1", label: "GPT-4.1" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
] as const

interface AgentFormProps {
  salonId: string
  mode: "create" | "edit"
  initialData?: Partial<AgentSchema> & { id?: string }
  onCancel?: () => void
}

export function AgentForm({ salonId, mode, initialData, onCancel }: AgentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<AgentSchema>({
    resolver: zodResolver(agentSchema),
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

  const isActive = form.watch("isActive")

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

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
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
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel} disabled={isPending}>
            <X size={20} />
          </Button>
        )}
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto custom-scrollbar space-y-6">
        {/* Nome do Agente */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Bot size={20} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Informações Básicas</h3>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Nome do Agente
            </label>
            <input
              type="text"
              {...form.register("name")}
              placeholder="Ex.: Assistente de Atendimento"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            {form.formState.errors.name && (
              <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
            )}
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquareText size={20} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">System Prompt</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Instruções que definem o comportamento e personalidade do agente. Este prompt será enviado para o Vercel
            como system prompt base do agente.
          </p>

          <div className="space-y-1.5">
            <textarea
              rows={8}
              {...form.register("systemPrompt")}
              placeholder="Ex.: Você é um assistente do salão. Seja objetivo, confirme data/horário e peça nome/telefone quando necessário..."
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
            />
            {form.formState.errors.systemPrompt && (
              <p className="text-xs text-red-500">{form.formState.errors.systemPrompt.message}</p>
            )}
          </div>
        </div>

        {/* Configurações do Modelo */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={20} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Configurações do Modelo</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Modelo</label>
              <Controller
                control={form.control}
                name="model"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all">
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg">
                      {AGENT_MODELS.map((model) => (
                        <SelectItem
                          key={model.value}
                          value={model.value}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-slate-50 dark:focus:bg-slate-800"
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
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tom</label>
              <Controller
                control={form.control}
                name="tone"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all">
                      <SelectValue placeholder="Selecione o tom" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-lg">
                      <SelectItem
                        value="formal"
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-slate-50 dark:focus:bg-slate-800"
                      >
                        Formal
                      </SelectItem>
                      <SelectItem
                        value="informal"
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-slate-50 dark:focus:bg-slate-800"
                      >
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
        </div>

        {/* WhatsApp */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Phone size={20} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Integração WhatsApp</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Número do WhatsApp que será integrado com o Twilio. Quando este número receber mensagens, o agente
            específico irá responder.
          </p>

          <div className="space-y-1.5">
            <input
              type="text"
              {...form.register("whatsappNumber")}
              placeholder="Ex.: +5511999999999"
              className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
            />
            {form.formState.errors.whatsappNumber && (
              <p className="text-xs text-red-500">{form.formState.errors.whatsappNumber.message}</p>
            )}
          </div>
        </div>

        {/* Treinamentos */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Treinamentos</h3>
          </div>
          <div className="flex items-center gap-2 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5">
            <AlertCircle size={16} className="text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Funcionalidade em desenvolvimento</p>
          </div>
        </div>

        {/* Status Ativo */}
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ativo</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Apenas um agente pode estar ativo por vez. Ao ativar este agente, os outros serão desativados
                automaticamente.
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
            <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                <strong>Atenção:</strong> Ao salvar, todos os outros agentes deste salão serão desativados
                automaticamente.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pb-6">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={isPending} className="min-w-[120px]">
            {isPending ? (
              "Salvando..."
            ) : (
              <>
                <Save size={16} className="mr-2" />
                {mode === "create" ? "Criar Agente" : "Salvar Alterações"}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

