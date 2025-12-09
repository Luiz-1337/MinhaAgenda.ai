"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, MoreHorizontal } from "lucide-react"

type ConversationStatus = "Ativo" | "Finalizado" | "Aguardando humano"
type Conversation = {
  id: string
  customer: { name: string; phone: string }
  lastMessageAt: string
  preview: string
  status: ConversationStatus
  assignedTo: string
}

type ChatMessage = {
  id: string
  from: "cliente" | "agente" | "sistema"
  text: string
  time: string
}

const conversations: Conversation[] = [
  {
    id: "1",
    customer: { name: "Cesar Aubar", phone: "(11) 98888-7777" },
    lastMessageAt: "10:42",
    preview: "Eu queria saber sobre horários disponíveis amanhã.",
    status: "Ativo",
    assignedTo: "Liz - Marcos Affonso",
  },
  {
    id: "2",
    customer: { name: "Larissa Oliveira", phone: "(21) 97777-6666" },
    lastMessageAt: "09:12",
    preview: "Obrigada! até mais.",
    status: "Finalizado",
    assignedTo: "Liz - Marina Alves",
  },
  {
    id: "3",
    customer: { name: "João Lima", phone: "(31) 96666-5555" },
    lastMessageAt: "Ontem",
    preview: "Aguarde um momento, estou transferindo...",
    status: "Aguardando humano",
    assignedTo: "Liz - Diego Ramos",
  },
]

const chatByConversation: Record<string, ChatMessage[]> = {
  "1": [
    { id: "m1", from: "cliente", text: "Bom dia! Quais horários você tem amanhã?", time: "10:38" },
    { id: "m2", from: "agente", text: "Olá, Cesar! Temos 10h, 14h e 17h.", time: "10:40" },
    { id: "m3", from: "sistema", text: "Estou transferindo você para um atendente humano.", time: "10:41" },
    { id: "m4", from: "cliente", text: "Perfeito, pode ser às 14h.", time: "10:42" },
  ],
  "2": [
    { id: "m1", from: "agente", text: "Seu atendimento foi finalizado. Qualquer dúvida, estamos aqui!", time: "09:10" },
    { id: "m2", from: "cliente", text: "Obrigada! até mais.", time: "09:12" },
  ],
  "3": [
    { id: "m1", from: "cliente", text: "Quero confirmar meu horário de amanhã.", time: "Ontem" },
    { id: "m2", from: "sistema", text: "Estou transferindo você...", time: "Ontem" },
  ],
}

export default function ChatPage() {
  const [tab, setTab] = useState("todos")
  const [query, setQuery] = useState("")
  const [activeId, setActiveId] = useState(conversations[0].id)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = conversations
    if (tab !== "todos") {
      list = list.filter((c) =>
        tab === "Em espera" ? c.status === "Aguardando humano" : c.status !== "Aguardando humano"
      )
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
  }, [tab, query])

  const active = useMemo(() => filtered.find((c) => c.id === activeId) ?? filtered[0], [filtered, activeId])
  const messages = useMemo(() => (active ? chatByConversation[active.id] ?? [] : []), [active])

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[340px_1fr] lg:grid-cols-[380px_1fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Conversas</div>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="Em espera">Em espera</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} />
            </Tabs>
            <Input
              placeholder="Buscar..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="max-w-[220px]"
            />
          </div>

          <div className="space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className="hover:bg-muted/50 flex w-full items-start gap-3 rounded-md p-2 text-left"
              >
                <Avatar>
                  <AvatarFallback>{c.customer.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{c.customer.name}</div>
                    <div className="text-muted-foreground text-xs">{c.lastMessageAt}</div>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">{c.preview}</div>
                  <div className="mt-2 flex items-center gap-2">
                    {c.status === "Ativo" && (
                      <Badge className="bg-green-100 text-green-700 border-green-200">Ativo</Badge>
                    )}
                    {c.status === "Finalizado" && (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">Finalizado</Badge>
                    )}
                    {c.status === "Aguardando humano" && (
                      <Badge className="bg-orange-100 text-orange-700 border-orange-200">Aguardando humano</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="flex h-full flex-col">
          <div className="border-b p-4">
            {active && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{active.customer.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{active.customer.name}</div>
                    <div className="text-muted-foreground text-xs">{active.customer.phone}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground text-xs">{active.assignedTo}</div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ações">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Transferir</DropdownMenuItem>
                      <DropdownMenuItem>Finalizar</DropdownMenuItem>
                      <DropdownMenuItem variant="destructive">Bloquear</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                {messages.map((m) => {
                  if (m.from === "sistema") {
                    return (
                      <div key={m.id} className="text-muted-foreground text-center text-xs">
                        {m.text}
                      </div>
                    )
                  }
                  const isClient = m.from === "cliente"
                  return (
                    <div key={m.id} className={`flex ${isClient ? "justify-start" : "justify-end"}`}>
                      <div
                        className={
                          isClient
                            ? "bg-violet-600 text-white max-w-[75%] rounded-2xl px-3 py-2 shadow-sm"
                            : "bg-muted max-w-[75%] rounded-2xl px-3 py-2 shadow-sm"
                        }
                      >
                        <div className="text-sm">{m.text}</div>
                        <div className={isClient ? "text-violet-100 mt-1 text-[10px]" : "text-muted-foreground mt-1 text-[10px]"}>
                          {m.time}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="border-t p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault()
              }}
              className="flex items-end gap-2"
            >
              <textarea
                placeholder="Digite sua mensagem..."
                className="bg-background focus-visible:ring-ring/50 min-h-12 w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:outline-1"
                rows={3}
              />
              <Button type="submit" className="bg-violet-600 text-white hover:bg-violet-700" aria-label="Enviar">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  )
}

