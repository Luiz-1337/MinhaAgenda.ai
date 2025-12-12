"use client"

import { useMemo, useState } from "react"
import { Search, Plus, MoreHorizontal, Bot } from "lucide-react"
import { toast } from "sonner"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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

export default function AgentsPage() {
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

  function toggleStatus(id: string) {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === "Ativo" ? "Inativo" : "Ativo" } : a
      )
    )
  }

  function handleCreateAgent() {
    toast.info("Funcionalidade de criação de agente em desenvolvimento")
    // TODO: Implementar modal/dialog para criar novo agente
  }

  function handleEditAgent(agent: Agent) {
    toast.info(`Editando agente: ${agent.name}`)
    // TODO: Implementar modal/dialog para editar agente
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

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
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
                    <button className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors">
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


