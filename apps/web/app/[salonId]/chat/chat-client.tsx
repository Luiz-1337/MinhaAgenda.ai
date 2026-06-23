"use client"

import { memo, useDeferredValue, useMemo, useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Send, Loader2, UserRound, ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getChatConversations, getChatMessages, setChatManualMode, sendManualMessage, getNoShowRiskForChat, type ChatConversation, type ChatMessage } from "@/app/actions/chats"
import { listKanbanColumns, moveChatToKanbanColumn } from "@/app/actions/kanban"
import type { KanbanColumnDTO } from "@/lib/types/kanban"

type ConversationStatus = "Ativo" | "Finalizado" | "Aguardando humano"

// Helper para obter iniciais
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase()
}

// Helper para badge de status
function getStatusBadge(status: ConversationStatus) {
  switch (status) {
    case "Ativo":
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
          Ativo
        </span>
      )
    case "Finalizado":
      return (
        <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-[10px] font-medium text-blue-700 dark:text-blue-300">
          Finalizado
        </span>
      )
    case "Aguardando humano":
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-700 dark:text-amber-300">
          Aguardando humano
        </span>
      )
    default:
      return null
  }
}

// Bolha de mensagem memoizada: evita re-render de toda a lista a cada poll/setMessages.
const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isClient = msg.from === "cliente"
  const isMedia = msg.mediaType === "image" || msg.mediaType === "audio"
  // Esconde o placeholder "[imagem]"/"[áudio]" quando é mídia; mantém legenda real.
  const isPlaceholder = isMedia && /^\[[^\]]+\]$/.test((msg.text || "").trim())
  const showText = !!msg.text && !isPlaceholder

  return (
    <div className={`flex w-full ${isClient ? "justify-start" : "justify-end"}`}>
      <div className="max-w-[85%] md:max-w-[70%] relative group">
        {/* Message Bubble */}
        <div
          className={`p-3 md:p-4 relative ${isClient
            ? "bg-chat-user text-chat-user-foreground rounded-lg rounded-tl-none"
            : "bg-chat-bot text-chat-bot-foreground rounded-lg rounded-tr-none"
            }`}
        >
          {isMedia && (
            msg.mediaUrl ? (
              msg.mediaType === "image" ? (
                <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="block mb-1">
                  {/* URL assinada e temporária — next/image otimizaria por URL e quebraria a cada renovação; <img> é o certo aqui */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={msg.mediaUrl}
                    alt="Imagem enviada pelo cliente"
                    loading="lazy"
                    className="rounded-lg max-h-72 w-auto object-cover cursor-zoom-in"
                  />
                </a>
              ) : (
                <audio controls preload="none" src={msg.mediaUrl} className="mb-1 w-56 max-w-full" />
              )
            ) : (
              <div className="flex items-center gap-2 text-xs opacity-70 mb-1">
                <Loader2 size={14} className="animate-spin" />
                {msg.mediaType === "image" ? "Recebendo imagem…" : "Recebendo áudio…"}
              </div>
            )
          )}
          {showText && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
          )}
          <span
            className={`text-[10px] font-mono mt-1 block opacity-60 ${isClient ? "text-chat-user-foreground/60" : "text-chat-bot-foreground/60"
              }`}
          >
            {msg.time}
          </span>
          {!isClient && (msg.deliveryStatus === "failed" || msg.deliveryStatus === "undelivered") && (
            <span className="text-[10px] font-medium mt-0.5 block text-red-500">não entregue</span>
          )}
          {!isClient && msg.deliveryStatus === "retrying" && (
            <span className="text-[10px] font-medium mt-0.5 block text-amber-500">reenviando…</span>
          )}
        </div>
      </div>
    </div>
  )
})

export default function ChatClient({ salonId }: { salonId: string }) {
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const requestedChatId = searchParams.get("chatId")
  const [filter, setFilter] = useState<"all" | "waiting" | "manual">("all")
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [activeId, setActiveId] = useState<string | null>(requestedChatId)
  const [showConversationList, setShowConversationList] = useState(true) // Mobile toggle
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState("")
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isTogglingManual, setIsTogglingManual] = useState(false)
  const [activeRisk, setActiveRisk] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isLoadingRef = useRef(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastMessageCountRef = useRef<number>(0)
  // Assinatura (id + deliveryStatus) p/ detectar mudanças que o length sozinho não pega
  const lastSignatureRef = useRef<string>("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Busca conversas com cache e polling automático via React Query
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["conversations", salonId],
    queryFn: async () => {
      const result = await getChatConversations(salonId)
      if ("error" in result) {
        toast.error(result.error)
        return []
      }
      return result
    },
    enabled: !!salonId,
    refetchInterval: 30_000, // 30s polling
    refetchIntervalInBackground: false, // Não refetch quando tab oculta
  })

  // Busca colunas kanban para o submenu "Encaminhar para…"
  const { data: kanbanColumns = [] } = useQuery<KanbanColumnDTO[]>({
    queryKey: ["kanban-columns", salonId],
    queryFn: async () => {
      const result = await listKanbanColumns(salonId)
      if ("error" in result) return []
      return result
    },
    enabled: !!salonId,
    staleTime: 60_000,
  })

  // Define activeId quando conversas carregam pela primeira vez
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      setActiveId(conversations[0].id)
    }
  }, [conversations, activeId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    let list = conversations
    if (filter === "waiting") {
      list = list.filter((c) => c.status === "Aguardando humano")
    } else if (filter === "manual") {
      list = list.filter((c) => c.isManual)
    }
    if (q) {
      const qDigits = q.replace(/\D/g, "")
      list = list.filter(
        (c) =>
          c.customer.name.toLowerCase().includes(q) ||
          c.preview.toLowerCase().includes(q) ||
          (qDigits.length > 0 && c.customer.phone.replace(/\D/g, "").includes(qDigits))
      )
    }
    return list
  }, [filter, deferredQuery, conversations])

  // Contador de chats em atendimento manual (a IA não responde estes)
  const manualCount = useMemo(() => conversations.filter((c) => c.isManual).length, [conversations])

  const active = useMemo(() => filtered.find((c) => c.id === activeId) ?? filtered[0], [filtered, activeId])
  const isManualMode = useMemo(() => {
    if (!active) return false
    return active.isManual || false
  }, [active?.id, active?.isManual])

  // Atualiza mensagens quando o chat ativo muda
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      lastMessageCountRef.current = 0
      return
    }

    let isMounted = true

    async function loadMessages() {
      // Evita carregar se já estiver carregando
      if (isLoadingRef.current) return

      isLoadingRef.current = true
      setIsLoadingMessages(true)
      try {
        if (!activeId || !isMounted) return
        const result = await getChatMessages(activeId)
        if (!isMounted) return
        if ("error" in result) {
          toast.error(result.error)
          setMessages([])
          lastMessageCountRef.current = 0
        } else {
          setMessages(result)
          lastMessageCountRef.current = result.length
          lastSignatureRef.current = result.map((m) => `${m.id}:${m.deliveryStatus ?? ""}:${m.mediaUrl ? "1" : "0"}`).join("|")
        }
      } catch (error) {
        if (!isMounted) return
        console.error("Erro ao carregar mensagens:", error)
        toast.error("Erro ao carregar mensagens")
      } finally {
        isLoadingRef.current = false
        if (isMounted) {
          setIsLoadingMessages(false)
        }
      }
    }

    // Carrega mensagens imediatamente
    loadMessages()

    return () => {
      isMounted = false
      isLoadingRef.current = false
    }
  }, [activeId])

  // Polling adaptativo para novas mensagens - pausa quando tab está oculta
  useEffect(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    if (!activeId) {
      return
    }

    let isMounted = true

    async function checkForNewMessages() {
      if (isLoadingRef.current || !isMounted || !activeId) return

      isLoadingRef.current = true
      try {
        const result = await getChatMessages(activeId)
        if (!isMounted) return
        if (!("error" in result)) {
          // Compara id+deliveryStatus de todas as mensagens: pega mudança de status
          // de entrega (ex.: "reenviando"→"não entregue") que o length ignora.
          const signature = result.map((m) => `${m.id}:${m.deliveryStatus ?? ""}:${m.mediaUrl ? "1" : "0"}`).join("|")
          if (signature !== lastSignatureRef.current) {
            setMessages(result)
            lastMessageCountRef.current = result.length
            lastSignatureRef.current = signature
          }
        }
      } catch (error) {
        if (!isMounted) return
        console.error("Erro ao verificar novas mensagens:", error)
      } finally {
        isLoadingRef.current = false
      }
    }

    function startPolling() {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current)
      // 5s quando tab visível, 30s quando oculta
      const interval = document.hidden ? 30000 : 5000
      pollingIntervalRef.current = setInterval(() => {
        if (isMounted && activeId && !isLoadingRef.current) {
          checkForNewMessages()
        }
      }, interval)
    }

    function handleVisibilityChange() {
      startPolling()
      // Verifica imediatamente ao voltar à tab
      if (!document.hidden) {
        checkForNewMessages()
      }
    }

    startPolling()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [activeId])

  // Busca o risco de No-Show quando o chat ativo muda
  useEffect(() => {
    if (!activeId) return
    let isMounted = true
    setActiveRisk(false)

    getNoShowRiskForChat(activeId).then((res) => {
      if (!isMounted) return
      if ("isHighRisk" in res) {
        setActiveRisk(res.isHighRisk)
      }
    }).catch(err => {
      console.error("Erro ao carregar risco:", err)
    })

    return () => {
      isMounted = false
    }
  }, [activeId])

  async function handleToggleManualMode() {
    if (!activeId) return

    setIsTogglingManual(true)
    try {
      const result = await setChatManualMode(activeId, !isManualMode)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(isManualMode ? "Modo automático ativado" : "Modo manual ativado")
        // Invalida cache para refletir a mudança
        queryClient.invalidateQueries({ queryKey: ["conversations", salonId] })
      }
    } catch (error) {
      console.error("Erro ao alternar modo manual:", error)
      toast.error("Erro ao alternar modo manual")
    } finally {
      setIsTogglingManual(false)
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!messageText.trim() || !activeId || !isManualMode) return

    setIsSendingMessage(true)
    const messageToSend = messageText.trim()
    setMessageText("")

    // Adiciona mensagem otimisticamente ao estado local
    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      from: "agente",
      text: messageToSend,
      time: "Agora"
    }
    setMessages(prev => [...prev, optimisticMessage])
    lastMessageCountRef.current += 1

    try {
      const result = await sendManualMessage(activeId, messageToSend)
      if ("error" in result) {
        toast.error(result.error)
        setMessageText(messageToSend) // Restaura o texto em caso de erro
        // Remove mensagem otimista em caso de erro
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
        lastMessageCountRef.current -= 1
      } else {
        // Recarrega mensagens apenas uma vez para garantir sincronização
        // O polling vai manter atualizado depois
        const updatedMessages = await getChatMessages(activeId)
        if (!("error" in updatedMessages)) {
          setMessages(updatedMessages)
          lastMessageCountRef.current = updatedMessages.length
        }
        if (textareaRef.current) {
          textareaRef.current.focus()
        }
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error)
      toast.error("Erro ao enviar mensagem")
      setMessageText(messageToSend) // Restaura o texto em caso de erro
      // Remove mensagem otimista em caso de erro
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
      lastMessageCountRef.current -= 1
    } finally {
      setIsSendingMessage(false)
    }
  }

  async function handleForwardToColumn(conversationId: string, columnId: string) {
    const result = await moveChatToKanbanColumn({ chatId: conversationId, columnId })
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Conversa encaminhada")
    queryClient.invalidateQueries({ queryKey: ["conversations", salonId] })
    queryClient.invalidateQueries({ queryKey: ["kanban", salonId] })
  }

  function handleFinishConversation(conversationId: string) {
    if (confirm("Tem certeza que deseja finalizar esta conversa?")) {
      toast.success("Conversa finalizada")
      // TODO: Implementar lógica de finalização
    }
  }

  function handleBlockConversation(conversationId: string) {
    if (confirm("Tem certeza que deseja bloquear este contato?")) {
      toast.success("Contato bloqueado")
      // TODO: Implementar lógica de bloqueio
    }
  }

  // Handler para selecionar conversa (com toggle para mobile)
  function handleSelectConversation(chatId: string) {
    setActiveId(chatId)
    setShowConversationList(false) // Em mobile, mostra o chat ao selecionar
  }

  return (
    <div className="h-full p-2 md:p-6">
      <div className="flex h-full bg-background rounded-lg overflow-hidden border border-border relative">
        {/* Sidebar List */}
        <div className={cn(
          "border-r border-border flex flex-col bg-card",
          "w-full md:w-80",
          "absolute md:relative inset-0 z-20 md:z-auto",
          !showConversationList && "hidden md:flex"
        )}>
          {/* Sidebar Header */}
          <div className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Conversas</h2>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${filter === "all"
                  ? "bg-card text-foreground dark:text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter("waiting")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${filter === "waiting"
                  ? "bg-card text-foreground dark:text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Em espera
              </button>
              <button
                onClick={() => setFilter("manual")}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${filter === "manual"
                  ? "bg-card text-foreground dark:text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                Manual
                {manualCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-success text-primary-foreground text-[9px] font-bold leading-none">
                    {manualCount}
                  </span>
                )}
              </button>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-muted/50 border border-border rounded-xl pl-9 pr-4 py-2 text-xs text-foreground focus:outline-none focus:border-ring/50 transition-all placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin text-muted-foreground" size={20} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            ) : (
              filtered.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => handleSelectConversation(chat.id)}
                  className={`p-4 flex gap-3 cursor-pointer transition-colors border-b border-border hover:bg-muted ${activeId === chat.id
                    ? "bg-accent/10 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary"
                    : ""
                    }`}
                >
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {getInitials(chat.customer.name)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h3
                        className={`text-sm font-semibold truncate ${activeId === chat.id ? "text-accent" : "text-foreground"
                          }`}
                      >
                        {chat.customer.name}
                      </h3>
                      <span className="text-[10px] text-muted-foreground font-mono">{chat.lastMessageAt}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">{chat.preview}</p>
                    {getStatusBadge(chat.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col bg-muted/30 dark:bg-background relative",
          showConversationList && "hidden md:flex"
        )}>
          {/* Background Grid Pattern */}
          <div
            className="absolute inset-0 z-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #808080 1px, transparent 1px), linear-gradient(to bottom, #808080 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          {/* Chat Header */}
          {active && (
            <header className="h-16 md:h-20 flex items-center justify-between px-3 md:px-6 border-b border-border bg-card z-10">
              <div className="flex items-center gap-2 md:gap-4">
                {/* Botao voltar - apenas mobile */}
                <button
                  onClick={() => setShowConversationList(true)}
                  className="md:hidden p-2 -ml-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center text-xs md:text-sm font-bold text-primary-foreground">
                  {getInitials(active.customer.name)}
                </div>
                <div>
                  <h2 className="text-xs md:text-sm font-bold text-foreground flex items-center gap-2">
                    {active.customer.name}
                    {active.kanbanColumnName && active.kanbanColumnColor && (
                      <span
                        className="px-2 py-0.5 rounded-full border text-[10px] font-medium"
                        style={{
                          backgroundColor: active.kanbanColumnColor + "20",
                          borderColor: active.kanbanColumnColor + "40",
                          color: active.kanbanColumnColor
                        }}
                      >
                        {active.kanbanColumnName}
                      </span>
                    )}
                    {active.customerTags?.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-2 py-0.5 rounded-full border text-[10px] font-medium"
                        style={{
                          backgroundColor: tag.color + "20",
                          borderColor: tag.color + "40",
                          color: tag.color,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {activeRisk && (
                      <span
                        className="px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-[10px] font-medium text-red-700 dark:text-red-300"
                        title="ALERTA: Este cliente possui histórico de faltas em mais de 30% dos agendamentos no salão."
                      >
                        ⚠️ Alto Risco
                      </span>
                    )}
                  </h2>
                  <p className="text-[10px] md:text-xs text-muted-foreground font-mono">{active.customer.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <Button
                  onClick={handleToggleManualMode}
                  disabled={isTogglingManual}
                  variant={isManualMode ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "text-xs px-2 md:px-3",
                    isManualMode ? "bg-success hover:bg-success/90 text-primary-foreground" : ""
                  )}
                >
                  <UserRound size={16} />
                  <span className="hidden lg:inline ml-1">
                    {isManualMode ? "Passar para a IA" : "Assumir Manualmente"}
                  </span>
                </Button>
                <div className="text-right hidden lg:block">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Atendente</p>
                  <p className="text-xs text-foreground">{active.assignedTo}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                      <MoreHorizontal size={20} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {kanbanColumns.length > 0 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Encaminhar para…</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {kanbanColumns
                            .filter((col) => col.id !== active.kanbanColumnId)
                            .map((col) => (
                              <DropdownMenuItem
                                key={col.id}
                                onClick={() => handleForwardToColumn(active.id, col.id)}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: col.color }}
                                />
                                {col.name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuItem onClick={() => handleFinishConversation(active.id)}>Finalizar</DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-red-600 dark:text-red-400"
                      onClick={() => handleBlockConversation(active.id)}
                    >
                      Bloquear
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4 md:space-y-6 custom-scrollbar z-10">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Nenhuma mensagem ainda
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 md:p-6 bg-card border-t border-border z-10">
            {isManualMode ? (
              <form onSubmit={handleSendMessage} className="relative">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  placeholder="Digite sua mensagem..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-4 py-3 pr-12 text-sm text-foreground focus:outline-none focus:border-ring/50 transition-all resize-none placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={!messageText.trim() || isSendingMessage}
                  className="absolute right-3 bottom-3 p-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSendingMessage ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
            ) : (
              <div className="w-full bg-muted/50 border border-border rounded-md px-4 py-3 text-sm text-muted-foreground text-center">
                Ative o modo manual para enviar mensagens
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

