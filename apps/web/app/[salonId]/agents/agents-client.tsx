"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Search, Plus, MoreHorizontal, Bot, Sparkles, MessageSquareText } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { agentConfigSchema, type AgentConfigSchema } from "@/lib/schemas"
import { updateAgentConfig } from "@/app/actions/agent-config"

type AgentStatus = "Ativo" | "Inativo"
type AgentRole = "SUPPORT" | "SALES" | "TRAINER"
type Agent = {
  id: string
  name: string
  description: string
  role: AgentRole
  status: AgentStatus
}

const initialAgents: Agent[] = [
  {
    id: "1",
    name: "Larissa - Cesar",
    description: "Cesar Aubar é cabeleireiro com 10 anos de experiência em cortes masculinos.",
    role: "SUPPORT",
    status: "Ativo",
  },
  {
    id: "2",
    name: "Marina - Studio",
    description: "Especialista em coloração e tratamento capilar avançado.",
    role: "SUPPORT",
    status: "Inativo",
  },
  {
    id: "3",
    name: "Diego - Barber",
    description: "Atendente focado em agenda, confirmações e pós-atendimento.",
    role: "SUPPORT",
    status: "Ativo",
  },
]

type AgentsClientProps = {
  salonId: string
  initialAgentConfig: {
    system_instructions: string
    tone: "formal" | "informal"
    isActive: boolean
  }
}

export function AgentsClient({ salonId, initialAgentConfig }: AgentsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<AgentConfigSchema>({
    resolver: zodResolver(agentConfigSchema),
    defaultValues: initialAgentConfig,
    mode: "onChange",
  })

  useEffect(() => {
    form.reset(initialAgentConfig)
  }, [form, initialAgentConfig])

  function onSubmit(values: AgentConfigSchema) {
    startTransition(async () => {
      const res = await updateAgentConfig(salonId, {
        system_instructions: (values.system_instructions ?? "").trim(),
        tone: values.tone,
        isActive: values.isActive,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("Configuração do agente salva com sucesso")
      router.refresh()
    })
  }

  const [agents, setAgents] = useState<Agent[]>(initialAgents)
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesFilter =
        filter === "all" ? true : filter === "active" ? agent.status === "Ativo" : agent.status === "Inativo"

      const matchesSearch =
        agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesFilter && matchesSearch
    })
  }, [agents, filter, searchTerm])

  function handleCreateAgent() {
    toast.info("Funcionalidade de criação de agente em desenvolvimento")
  }

  function handleEditAgent(agent: Agent) {
    toast.info(`Editando agente: ${agent.name}`)
  }

  function handleDuplicateAgent(agent: Agent) {
    const newAgent: Agent = {
      ...agent,
      id: Date.now().toString(),
      name: `${agent.name} (cópia)`,
    }
    setAgents((prev) => [...prev, newAgent])
    toast.success("Agente duplicado com sucesso")
  }

  function handleRemoveAgent(agent: Agent) {
    if (confirm(`Tem certeza que deseja remover o agente "${agent.name}"?`)) {
      setAgents((prev) => prev.filter((a) => a.id !== agent.id))
      toast.success("Agente removido")
    }
  }

  // Helper para extrair iniciais do nome
  function getInitials(name: string): string {
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Helper para extrair subName (parte após o hífen)
  function getSubName(name: string): string {
    const parts = name.split(" - ")
    return parts.length > 1 ? parts[1] : ""
  }

  // Helper para extrair nome principal (parte antes do hífen)
  function getMainName(name: string): string {
    const parts = name.split(" - ")
    return parts[0]
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Agentes</h2>
        <button
          onClick={handleCreateAgent}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
        >
          <Plus size={16} />
          Criar agente
        </button>
      </div>

      {/* Agent Config Form */}
      <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-500" /> Configuração do Agente
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Estes dados são salvos em <span className="font-mono">salons.settings.agent_config</span>.
            </p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Instruções do sistema
              </label>
              <div className="relative">
                <MessageSquareText size={16} className="absolute left-3 top-3 text-slate-400" />
                <textarea
                  rows={5}
                  {...form.register("system_instructions")}
                  placeholder="Ex.: Você é um assistente do salão. Seja objetivo, confirme data/horário e peça nome/telefone quando necessário..."
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all resize-none"
                />
              </div>
              {form.formState.errors.system_instructions && (
                <p className="text-xs text-red-500">{form.formState.errors.system_instructions.message}</p>
              )}
            </div>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tom</label>
                <select
                  {...form.register("tone")}
                  className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all"
                >
                  <option value="formal">Formal</option>
                  <option value="informal">Informal</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ativo</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Habilita o agente para o salão.</p>
                </div>

                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Switch checked={!!field.value} onCheckedChange={(v) => field.onChange(v)} />
                  )}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </form>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "active"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Ativos
          </button>
          <button
            type="button"
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "inactive"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar agentes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Agents List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
        {filteredAgents.map((agent) => {
          const mainName = getMainName(agent.name)
          const subName = getSubName(agent.name)
          const displayName = subName ? `${mainName} - ${subName}` : mainName
          const initial = getInitials(mainName)

          return (
            <div
              key={agent.id}
              className="group flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-white/5 rounded-xl hover:border-indigo-500/30 transition-all duration-300"
            >
              <div className="flex items-start md:items-center gap-4 flex-1">
                {/* Avatar / Initial */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-slate-800 dark:bg-slate-950 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-200 font-mono text-sm font-bold">
                  {initial}
                </div>

                <div className="flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{displayName}</h3>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      {agent.role}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">
                    {agent.description}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                {agent.status === "Ativo" ? (
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                    Ativo
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-400">
                    Inativo
                  </span>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
                    >
                      <MoreHorizontal size={20} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditAgent(agent)}>Editar</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicateAgent(agent)}>Duplicar</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 dark:text-red-400"
                      onClick={() => handleRemoveAgent(agent)}
                    >
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}

        {filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>Nenhum agente encontrado.</p>
          </div>
        )}
      </div>
    </div>
  )
}


