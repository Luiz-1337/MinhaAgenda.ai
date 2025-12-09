"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { MoreHorizontal } from "lucide-react"

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
  const [tab, setTab] = useState("todos")
  const [query, setQuery] = useState("")

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let arr = agents
    if (tab !== "todos") {
      arr = arr.filter((a) => a.status === (tab === "Ativos" ? "Ativo" : "Inativo"))
    }
    if (q) {
      arr = arr.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q)
      )
    }
    return arr
  }, [agents, tab, query])

  function toggleStatus(id: string) {
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, status: a.status === "Ativo" ? "Inativo" : "Ativo" } : a
      )
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agentes</h1>
        </div>
        <Button className="bg-teal-600 text-white hover:bg-teal-700">Criar agente</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="Ativos">Ativos</TabsTrigger>
              <TabsTrigger value="Inativos">Inativos</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} />
          </Tabs>
          <Input
            placeholder="Buscar agentes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="md:max-w-sm"
          />
        </div>
      </Card>

      <div className="space-y-3">
        {list.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-12">
                <AvatarFallback>{a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{a.name}</div>
                  <Badge variant="secondary">{a.role}</Badge>
                </div>
                <div className="text-muted-foreground mt-1 text-sm">{a.description}</div>
              </div>

              <div className="flex items-center gap-3">
                <Badge className={a.status === "Ativo" ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-foreground/70 border-muted-foreground/20"}>
                  {a.status}
                </Badge>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Ações">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>Editar</DropdownMenuItem>
                    <DropdownMenuItem>Duplicar</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive">Remover</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Switch checked={a.status === "Ativo"} onCheckedChange={() => toggleStatus(a.id)} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

