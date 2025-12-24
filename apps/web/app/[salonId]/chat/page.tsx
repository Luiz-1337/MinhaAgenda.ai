"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Search, MoreHorizontal, Send, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { getChatConversations, getChatMessages, type ChatConversation, type ChatMessage } from "@/app/actions/chats"

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
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400">
          Ativo
        </span>
      )
    case "Finalizado":
      return (
        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-medium text-blue-400">
          Finalizado
        </span>
      )
    case "Aguardando humano":
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-medium text-amber-400">
          Aguardando humano
        </span>
      )
    default:
      return null
  }
}

export default function ChatPage() {
  const params = useParams()
  const salonId = params?.salonId as string
  
  const [filter, setFilter] = useState<"all" | "waiting">("all")
  const [query, setQuery] = useState("")
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageText, setMessageText] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Busca conversas quando o componente carrega ou salonId muda
  useEffect(() => {
    if (!salonId) return

    async function loadConversations() {
      setIsLoading(true)
      try {
        const result = await getChatConversations(salonId)
        if ("error" in result) {
          toast.error(result.error)
          setConversations([])
        } else {
          setConversations(result)
          if (result.length > 0 && !activeId) {
            setActiveId(result[0].id)
          }
        }
      } catch (error) {
        console.error("Erro ao carregar conversas:", error)
        toast.error("Erro ao carregar conversas")
      } finally {
        setIsLoading(false)
      }
    }

    loadConversations()
  }, [salonId])

  // Busca mensagens quando o chat ativo muda
  useEffect(() => {
    if (!activeId) {
      setMessages([])
      return
    }

    async function loadMessages() {
      setIsLoadingMessages(true)
      try {
        if (!activeId) return
        const result = await getChatMessages(activeId)
        if ("error" in result) {
          toast.error(result.error)
          setMessages([])
        } else {
          setMessages(result)
        }
      } catch (error) {
        console.error("Erro ao carregar mensagens:", error)
        toast.error("Erro ao carregar mensagens")
      } finally {
        setIsLoadingMessages(false)
      }
    }

    loadMessages()
  }, [activeId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = conversations
    if (filter === "waiting") {
      list = list.filter((c) => c.status === "Aguardando humano")
    }
    if (q) {
      list = list.filter(
        (c) =>
          c.customer.name.toLowerCase().includes(q) ||
          c.preview.toLowerCase().includes(q) ||
          c.customer.phone.replace(/\D/g, "").includes(q.replace(/\D/g, ""))
      )
    }
    return list
  }, [filter, query, conversations])

  const active = useMemo(() => filtered.find((c) => c.id === activeId) ?? filtered[0], [filtered, activeId])

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!messageText.trim()) return
    
    // TODO: Implementar envio de mensagem via API
    toast.success("Mensagem enviada")
    setMessageText("")
    if (textareaRef.current) {
      textareaRef.current.focus()
    }
  }

  function handleTransferConversation(conversationId: string) {
    toast.info("Transferindo conversa...")
    // TODO: Implementar lógica de transferência
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

  return (
    <div className="h-full p-4 md:p-6">
      <div className="flex h-full bg-slate-50 dark:bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-white/5 shadow-2xl">
      {/* Sidebar List */}
      <div className="w-80 border-r border-slate-200 dark:border-white/5 flex flex-col bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
        {/* Sidebar Header */}
        <div className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Conversas</h2>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter("waiting")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === "waiting"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              Em espera
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="animate-spin text-slate-400" size={20} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhuma conversa encontrada
            </div>
          ) : (
            filtered.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveId(chat.id)}
              className={`p-4 flex gap-3 cursor-pointer transition-colors border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 ${
                activeId === chat.id
                  ? "bg-indigo-50/50 dark:bg-indigo-500/5 relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-indigo-500"
                  : ""
              }`}
            >
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                  {getInitials(chat.customer.name)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3
                    className={`text-sm font-semibold truncate ${
                      activeId === chat.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {chat.customer.name}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">{chat.lastMessageAt}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">{chat.preview}</p>
                {getStatusBadge(chat.status)}
              </div>
            </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-50/30 dark:bg-slate-950/30 backdrop-blur-sm relative">
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
          <header className="h-20 flex items-center justify-between px-6 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-slate-900/80 backdrop-blur-md z-10">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                {getInitials(active.customer.name)}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  {active.customer.name}
                </h2>
                <p className="text-xs text-slate-500 font-mono">{active.customer.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Atendente</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{active.assignedTo}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 text-slate-400 hover:text-white transition-colors">
                    <MoreHorizontal size={20} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleTransferConversation(active.id)}>Transferir</DropdownMenuItem>
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
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-10">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-slate-500">
              Nenhuma mensagem ainda
            </div>
          ) : (
            messages.map((msg) => {
              const isClient = msg.from === "cliente"

              return (
                <div key={msg.id} className={`flex w-full ${isClient ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[70%] relative group`}>
                    {/* Message Bubble */}
                    <div
                      className={`p-4 shadow-sm relative ${
                        isClient
                          ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl rounded-tl-none shadow-indigo-500/20"
                          : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-2xl rounded-tr-none border border-slate-200 dark:border-white/10"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text || ""}</p>
                      <span
                        className={`text-[10px] font-mono mt-1 block opacity-60 ${
                          isClient ? "text-indigo-200" : "text-slate-400"
                        }`}
                      >
                        {msg.time}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white/50 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200 dark:border-white/5 z-10">
          <form onSubmit={handleSendMessage} className="relative">
            <textarea
              ref={textareaRef}
              rows={3}
              placeholder="Digite sua mensagem..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all resize-none placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={!messageText.trim()}
              className="absolute right-3 bottom-3 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
    </div>
  )
}

