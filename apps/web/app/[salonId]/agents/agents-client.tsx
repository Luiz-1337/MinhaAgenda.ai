"use client"

import { useMemo, useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Bot, BrainCircuit, Phone, GraduationCap, FileText, Loader2, MessageCircle, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { deleteAgent, toggleAgentActive, type AgentRow } from "@/app/actions/agents"
import { AgentActionMenu } from "@/components/ui/agent-action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"

type WhatsAppNumber = {
  phoneNumber: string
  connectedAt?: string
}

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

  // WhatsApp state
  const [whatsappNumbers, setWhatsappNumbers] = useState<WhatsAppNumber[]>([])
  const [whatsappLoading, setWhatsappLoading] = useState(true)
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)

  // Fetch WhatsApp status on mount
  useEffect(() => {
    async function fetchWhatsAppStatus() {
      try {
        const res = await fetch(`/api/salons/${salonId}/whatsapp/status`)
        const data = await res.json()
        if (res.ok && data.numbers) {
          setWhatsappNumbers(data.numbers)
        }
      } catch {
        // Silently fail - no WhatsApp configured
      } finally {
        setWhatsappLoading(false)
      }
    }
    fetchWhatsAppStatus()
  }, [salonId])

  // WhatsApp handlers
  async function handleConnectWhatsApp() {
    const raw = whatsappPhoneInput.replace(/\s/g, "").replace(/-/g, "").replace(/[()]/g, "").trim()
    if (!/^\+[1-9]\d{10,14}$/.test(raw)) {
      toast.error("Formato de número inválido. Use o formato +5511999999999")
      return
    }
    setIsConnecting(true)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: raw }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "Erro ao conectar")
        return
      }
      const list = (await fetch(`/api/salons/${salonId}/whatsapp/status`).then((r) => r.json()))?.numbers || []
      setWhatsappNumbers(list)
      setWhatsappPhoneInput("")
      toast.success("WhatsApp conectado com sucesso!")
      router.refresh()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleDisconnectWhatsApp() {
    const n = whatsappNumbers[0]
    if (!n) return
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/disconnect`, {
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
      toast.success("Número desconectado com sucesso")
      router.refresh()
    } catch {
      toast.error("Erro ao desconectar. Tente novamente.")
    }
  }

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

  // Helper para mascarar número
  function maskPhone(p: string) {
    const d = p.replace(/\D/g, "")
    if (d.length >= 12 && p.startsWith("+55")) return `+55 ${d.slice(2, 4)} •••••-${d.slice(-4)}`
    if (d.length >= 10) return `${p.slice(0, 6)} •••••-${p.slice(-4)}`
    return p
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

      {/* WhatsApp Configuration Card */}
      <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-xl border border-slate-200 dark:border-white/5 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle size={18} className="text-emerald-500" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">WhatsApp do Salão</h3>
          <span className="text-xs text-slate-500 dark:text-slate-400">(compartilhado por todos os agentes)</span>
        </div>

        {whatsappLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando...
          </div>
        )}

        {!whatsappLoading && whatsappNumbers.length === 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">
                Número do WhatsApp
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={whatsappPhoneInput}
                  onChange={(e) => setWhatsappPhoneInput(e.target.value)}
                  placeholder="Ex.: +5511986049295"
                  className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <button
                  type="button"
                  disabled={isConnecting}
                  onClick={handleConnectWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-sm shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {isConnecting && <Loader2 size={16} className="animate-spin" />}
                  Conectar
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Formato: +5511999999999</p>
            </div>
          </div>
        )}

        {!whatsappLoading && whatsappNumbers.length > 0 && (() => {
          const n = whatsappNumbers[0]

          return (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{maskPhone(n.phoneNumber)}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckCircle size={12} />
                Conectado
              </span>
              <button
                type="button"
                onClick={() => setDisconnectModalOpen(true)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium"
              >
                Desconectar
              </button>
            </div>
          )
        })()}
      </div>

      <ConfirmModal
        open={disconnectModalOpen}
        onClose={() => setDisconnectModalOpen(false)}
        onConfirm={handleDisconnectWhatsApp}
        title="Desconectar WhatsApp"
        description="Tem certeza que deseja desconectar este número? Todos os agentes perderão a conexão com o WhatsApp."
        confirmText="Desconectar"
        type="danger"
      />

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
