"use client"

import { useDeferredValue, useMemo, useState, useTransition, useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Search, Plus, Bot, BrainCircuit, Phone, GraduationCap, FileText, Loader2, MessageCircle, CheckCircle, Clock, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { deleteAgent, toggleAgentActive, type AgentRow } from "@/app/actions/agents"
import { AgentActionMenu } from "@/components/ui/agent-action-menu"
import { ConfirmModal } from "@/components/ui/confirm-modal"

const QRCodeModal = dynamic(
  () => import("@/components/whatsapp/qrcode-modal").then(m => ({ default: m.QRCodeModal })),
  { ssr: false }
)
const VerificationModal = dynamic(
  () => import("@/components/whatsapp/verification-modal").then(m => ({ default: m.VerificationModal })),
  { ssr: false }
)

type WhatsAppNumber = {
  phoneNumber: string
  connectedAt?: string
  status?: string
}

type WhatsAppStatus = {
  numbers: WhatsAppNumber[]
  pendingVerification?: {
    phoneNumber: string
  }
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
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [openMenuAgentId, setOpenMenuAgentId] = useState<string | null>(null)

  // WhatsApp state
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus>({ numbers: [] })
  const [whatsappLoading, setWhatsappLoading] = useState(true)

  const [isConnecting, setIsConnecting] = useState(false)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)

  // Verification state
  const [verificationModalOpen, setVerificationModalOpen] = useState(false)
  const [pendingPhone, setPendingPhone] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationError, setVerificationError] = useState<string | null>(null)

  // QR code modal (Evolution API)
  const [qrcodeModalOpen, setQrcodeModalOpen] = useState(false)
  const [qrcodeData, setQrcodeData] = useState<string | null>(null)

  // Connection mode state


  // Derived state
  const whatsappNumbers = whatsappStatus.numbers
  const hasPendingVerification = whatsappNumbers.length > 0 && whatsappNumbers[0].status === "pending_verification"

  // Fetch WhatsApp status on mount
  useEffect(() => {
    fetchWhatsAppStatus()
  }, [salonId])

  async function fetchWhatsAppStatus() {
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/status`)
      const data = await res.json()
      if (res.ok) {
        setWhatsappStatus({
          numbers: data.numbers || [],
          pendingVerification: data.pendingVerification,
        })
        // Se tem verificação pendente, abre o modal automaticamente
        if (data.numbers?.[0]?.status === "pending_verification") {
          setPendingPhone(data.numbers[0].phoneNumber)
        }
      }
    } catch {
      // Silently fail - no WhatsApp configured
    } finally {
      setWhatsappLoading(false)
    }
  }

  // WhatsApp handlers - Manual connection (Evolution API com QR code)
  async function handleConnectWhatsApp(reconnect = false) {
    setIsConnecting(true)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconnect }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "Erro ao conectar")
        return
      }

      // Evolution API: QR code para escanear
      if (data.status === "connecting" && data.qrcode) {
        setQrcodeData(data.qrcode)
        setQrcodeModalOpen(true)
        toast.success("Escaneie o QR code com seu WhatsApp")
      } else if (data.status === "pending_verification") {
        setVerificationModalOpen(true)
        toast.success("SMS enviado! Digite o código de verificação.")
      } else if (data.status === "connected") {
        toast.success("WhatsApp já está conectado!")
      } else {
        toast.success("WhatsApp conectado com sucesso!")
      }

      await fetchWhatsAppStatus()
      router.refresh()
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setIsConnecting(false)
    }
  }

  // Verification handler
  async function handleVerify(code: string) {
    setIsVerifying(true)
    setVerificationError(null)
    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationCode: code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setVerificationError(data?.error || "Código inválido")
        throw new Error(data?.error)
      }

      toast.success("WhatsApp verificado com sucesso!")
      setVerificationModalOpen(false)
      setPendingPhone("")
      await fetchWhatsAppStatus()
      router.refresh()
    } catch {
      // Error already set
    } finally {
      setIsVerifying(false)
    }
  }

  // Resend verification code
  async function handleResendCode() {
    if (!pendingPhone) return

    try {
      const res = await fetch(`/api/salons/${salonId}/whatsapp/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: pendingPhone }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error || "Erro ao reenviar código")
        return
      }
      toast.success("Novo código enviado!")
    } catch {
      toast.error("Erro ao reenviar código")
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
      setWhatsappStatus({ numbers: [] })
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

      const matchesSearch = agent.name.toLowerCase().includes(deferredSearchTerm.toLowerCase())

      return matchesFilter && matchesSearch
    })
  }, [agents, filter, deferredSearchTerm])

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
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Agentes</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/${salonId}/agents/templates`)}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-sm font-semibold transition-colors border border-border"
          >
            <FileText size={16} />
            Templates
          </button>
          <button
            onClick={handleCreateAgent}
            className="flex items-center gap-2 px-4 py-2 bg-success hover:bg-success/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors "
          >
            <Plus size={16} />
            Criar agente
          </button>
        </div>
      </div>

      {/* WhatsApp Configuration Card */}
      <div className="w-full md:w-1/2 lg:w-1/3 bg-card rounded-md border border-border p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={18} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-foreground">WhatsApp do Salão</h3>
            <span className="text-xs text-muted-foreground">(compartilhado por todos os agentes)</span>
          </div>
        </div>

        {!whatsappLoading && whatsappNumbers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6">
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Conecte o WhatsApp do seu salão para que os agentes possam interagir com seus clientes.
            </p>
            <button
              type="button"
              disabled={isConnecting}
              onClick={() => handleConnectWhatsApp()}
              className="px-6 py-2.5 bg-success hover:bg-success/90 text-primary-foreground rounded-lg text-sm font-medium  transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isConnecting ? <Loader2 size={18} className="animate-spin" /> : <MessageCircle size={18} />}
              Conectar WhatsApp
            </button>
          </div>
        )}

        {/* Pending Verification State */}
        {!whatsappLoading && hasPendingVerification && (() => {
          const n = whatsappNumbers[0]
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Phone size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{maskPhone(n.phoneNumber)}</span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  <Clock size={12} />
                  Aguardando Verificação
                </span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Um SMS foi enviado para o número acima. Digite o código de 6 dígitos para verificar.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPendingPhone(n.phoneNumber)
                    setVerificationModalOpen(true)
                  }}
                  className="px-4 py-2 bg-success hover:bg-success/90 text-primary-foreground rounded-lg text-sm font-medium transition-all"
                >
                  Inserir Código
                </button>
                <button
                  type="button"
                  onClick={() => setDisconnectModalOpen(true)}
                  className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )
        })()}

        {/* Connected State - show when verified OR when has number but status is not pending */}
        {!whatsappLoading && whatsappNumbers.length > 0 && !hasPendingVerification && (() => {
          const n = whatsappNumbers[0]
          const isVerified = n.status === "verified" || !n.status
          return (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Phone size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{maskPhone(n.phoneNumber)}</span>
              </div>
              {isVerified ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <CheckCircle size={12} />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-foreground">
                  {n.status}
                </span>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleConnectWhatsApp(true)}
                  disabled={isConnecting}
                  className="px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  Reconectar
                </button>
                <button
                  type="button"
                  onClick={() => setDisconnectModalOpen(true)}
                  className="px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-md text-xs font-medium"
                >
                  Desconectar
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Verification Modal */}
      <VerificationModal
        open={verificationModalOpen}
        onClose={() => {
          setVerificationModalOpen(false)
          setVerificationError(null)
        }}
        onVerify={handleVerify}
        onResend={handleResendCode}
        phoneNumber={pendingPhone}
        isLoading={isVerifying}
        error={verificationError}
      />

      <QRCodeModal
        open={qrcodeModalOpen}
        onClose={() => {
          setQrcodeModalOpen(false)
          setQrcodeData(null)
          fetchWhatsAppStatus()
        }}
        qrcode={qrcodeData || ""}
        onStatusCheck={async () => {
          const res = await fetch(`/api/salons/${salonId}/whatsapp/status`)
          const data = await res.json()
          const connected = data.numbers?.[0]?.status === "verified"
          return { connected }
        }}
        pollIntervalMs={3000}
      />

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
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-2 rounded-md border border-border">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === "all"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === "active"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Ativos
          </button>
          <button
            type="button"
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === "inactive"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar agentes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all placeholder:text-muted-foreground"
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
              className={`group flex flex-col md:flex-row items-start md:items-center justify-between p-5 bg-card border border-border rounded-md hover:border-accent/30 transition-all duration-300 ${openMenuAgentId === agent.id ? "relative z-50" : "relative"
                }`}
            >
              <div className="flex items-start md:items-center gap-4 flex-1">
                {/* Avatar / Initial */}
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary dark:bg-muted border border-border flex items-center justify-center text-primary-foreground dark:text-foreground font-mono text-sm font-bold">
                  {initial}
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-foreground">{agent.name}</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
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
                  <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    Ativo
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-bold text-muted-foreground">
                    Inativo
                  </span>
                )}

                <button
                  onClick={() => router.push(`/${salonId}/agents/${agent.id}/training`)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/10 rounded-lg transition-colors"
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
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Bot size={48} className="mb-4 opacity-50" />
            <p>Nenhum agente encontrado.</p>
            {agents.length === 0 && (
              <button
                onClick={handleCreateAgent}
                className="mt-4 px-4 py-2 bg-success hover:bg-success/90 text-primary-foreground rounded-lg text-sm font-semibold transition-colors"
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
