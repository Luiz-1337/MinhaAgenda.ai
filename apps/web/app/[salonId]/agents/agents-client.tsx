"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Bot, BrainCircuit, Phone, GraduationCap, FileText } from "lucide-react"
import { toast } from "sonner"
import { deleteAgent, toggleAgentActive, type AgentRow } from "@/app/actions/agents"
import { AgentActionMenu } from "@/components/ui/agent-action-menu"

type AgentsClientProps = {
  salonId: string
  initialAgents: AgentRow[]
}

export function AgentsClient({ salonId, initialAgents }: AgentsClientProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [agents, setAgents] = useState<AgentRow[]>(initialAgents)
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [openMenuAgentId, setOpenMenuAgentId] = useState<string | null>(null)

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const matchesFilter =
        filter === "all" ? true : filter === "active" ? agent.isActive : !agent.isActive

      const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesFilter && matchesSearch
    })
  }, [agents, filter, searchTerm])

  function handleCreateAgent() {
    router.push(`/${salonId}/agents/new`)
  }

  function handleEditAgent(agent: AgentRow) {
    router.push(`/${salonId}/agents/${agent.id}/edit`)
  }

  function handleDuplicateAgent(agent: AgentRow) {
    // Navega para criar novo agente com dados pré-preenchidos
    router.push(`/${salonId}/agents/new?duplicate=${agent.id}`)
  }

  function handleRemoveAgent(agent: AgentRow) {
    if (!confirm(`Tem certeza que deseja remover o agente "${agent.name}"?`)) {
      return
    }

    startTransition(async () => {
      const res = await deleteAgent(salonId, agent.id)

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      toast.success("Agente removido com sucesso")
      setAgents((prev) => prev.filter((a) => a.id !== agent.id))
      router.refresh()
    })
  }

  function handleToggleActive(agent: AgentRow) {
    startTransition(async () => {
      const res = await toggleAgentActive(salonId, agent.id)

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      // Atualiza o estado local
      setAgents((prev) =>
        prev.map((a) => {
          if (a.id === agent.id) {
            return { ...a, isActive: res.data!.isActive }
          }
          // Se este agente foi ativado, desativa os outros
          if (res.data!.isActive && a.id !== agent.id && a.isActive) {
            return { ...a, isActive: false }
          }
          return a
        })
      )

      toast.success(`Agente ${res.data!.isActive ? "ativado" : "desativado"} com sucesso`)
      router.refresh()
    })
  }

  // Helper para extrair iniciais do nome
  function getInitials(name: string): string {
    const parts = name.split(" ")
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <div className="flex flex-col h-full gap-6 pt-[5px] pr-[5px] pl-[5px]">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Agentes</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${salonId}/agents/templates`)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-semibold transition-colors border border-slate-200 dark:border-white/10"
          >
            <FileText size={16} />
            Templates
          </button>
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Plus size={16} />
            Criar agente
          </button>
        </div>
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
          const initial = getInitials(agent.name)

          return (
            <div
              key={agent.id}
              className={`group flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200 dark:border-white/5 rounded-xl hover:border-indigo-500/30 transition-all duration-300 ${
                openMenuAgentId === agent.id ? "relative z-50" : "relative"
              }`}
            >
              <div className="flex items-start md:items-center gap-4 flex-1">
                {/* Avatar / Initial */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-slate-800 dark:bg-slate-950 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-200 font-mono text-sm font-bold">
                  {initial}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">{agent.name}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <BrainCircuit size={12} />
                      <span className="font-mono">{agent.model}</span>
                    </div>
                    {agent.whatsappNumber && (
                      <div className="flex items-center gap-1">
                        <Phone size={12} />
                        <span>{agent.whatsappNumber}</span>
                      </div>
                    )}
                    <span className="capitalize">{agent.tone}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 md:mt-0 w-full md:w-auto justify-between md:justify-end">
                {agent.isActive ? (
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                    Ativo
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-400">
                    Inativo
                  </span>
                )}

                <button
                  onClick={() => router.push(`/${salonId}/agents/${agent.id}/training`)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors"
                  title="Treinamentos da IA"
                >
                  <GraduationCap size={16} />
                  <span className="hidden sm:inline">Treinamentos</span>
                </button>

                <AgentActionMenu
                  onEdit={() => handleEditAgent(agent)}
                  onDelete={() => handleRemoveAgent(agent)}
                  onDuplicate={() => handleDuplicateAgent(agent)}
                  onToggleActive={() => handleToggleActive(agent)}
                  isActive={agent.isActive}
                  onOpenChange={(isOpen) => setOpenMenuAgentId(isOpen ? agent.id : null)}
                />
              </div>
            </div>
          )
        })}

        {filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>Nenhum agente encontrado.</p>
            {agents.length === 0 && (
              <button
                onClick={handleCreateAgent}
                className="mt-4 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Criar primeiro agente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
