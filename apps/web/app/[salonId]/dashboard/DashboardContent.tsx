"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { CheckCircle, MessageCircle, Clock } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { DashboardStats } from "@/app/actions/dashboard"

type Point = { date: string; value: number }

interface DashboardContentProps {
  stats: DashboardStats
}

export default function DashboardContent({ stats }: DashboardContentProps) {
  const [range, setRange] = useState<7 | 14 | 30>(7)
  
  const series = useMemo(() => {
    const data = stats.creditsByDay || []
    if (range === 7) return data.slice(-7)
    if (range === 14) return data.slice(-14)
    return data
  }, [range, stats.creditsByDay])

  // Calcula variação percentual (simulado por enquanto)
  const completedVariation = "+58%"
  const responseVariation = "+4%"
  const queueVariation = "-18%"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">IA v2 ativa</Badge>
              <Badge variant="outline">Fluxo estável</Badge>
              <Badge variant="secondary">Realtime</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Painel da operação</h1>
              <p className="text-muted-foreground">Dados em tempo real + IA</p>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Monitore atendimentos, consumo de créditos e performance dos agentes em uma interface mais imersiva.
            </p>
            <div className="flex gap-2">
              <Button>Criar nova campanha</Button>
              <Button variant="outline">Ver agenda ao vivo</Button>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col">
              <div className="text-sm text-muted-foreground">Taxa de resposta</div>
              <div className="text-2xl font-bold">{stats.responseRate}%</div>
              <div className="text-xs text-green-600">{responseVariation} semanal</div>
            </div>
            <div className="flex flex-col">
              <div className="text-sm text-muted-foreground">Fila média</div>
              <div className="text-2xl font-bold">{stats.queueAverageTime}</div>
              <div className="text-xs text-red-600">{queueVariation} vs ontem</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Infra saudável • Última sincronização há alguns segundos
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Atendimentos concluídos</div>
                <div className="text-2xl font-bold">{stats.completedAppointments}</div>
              </div>
            </div>
            <Badge variant="secondary">{completedVariation}</Badge>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-100 p-3">
                <MessageCircle className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Atendimentos em andamento</div>
                <div className="text-2xl font-bold">{stats.activeChats}</div>
              </div>
            </div>
            <Badge variant="outline">IA cobrindo {stats.responseRate}%</Badge>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-orange-100 p-3">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Tempo médio de atendimento</div>
                <div className="text-2xl font-bold">{stats.averageResponseTime}</div>
              </div>
            </div>
            <Badge variant="outline">SLA {stats.responseRate}%</Badge>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">Gastos de créditos por dia</div>
              <p className="text-sm text-muted-foreground">Monitorando consumo em {range} dias</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant={range === 7 ? "default" : "outline"}
                size="sm"
                onClick={() => setRange(7)}
              >
                7d
              </Button>
              <Button
                variant={range === 14 ? "default" : "outline"}
                size="sm"
                onClick={() => setRange(14)}
              >
                14d
              </Button>
              <Button
                variant={range === 30 ? "default" : "outline"}
                size="sm"
                onClick={() => setRange(30)}
              >
                30d
              </Button>
            </div>
          </div>
          <div className="h-[300px] w-full min-w-0">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="value" strokeWidth={3} dot={false} stroke="#10b981" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <div className="mb-4 text-lg font-semibold">Top agentes</div>
              <div className="space-y-3">
                {stats.topAgents.length > 0 ? (
                  stats.topAgents.map((a) => (
                    <div key={a.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{a.name}</div>
                      </div>
                      <div className="font-semibold">{a.credits} créditos</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum agente encontrado</p>
                )}
              </div>
            </div>

            <div>
              <div className="mb-4 text-lg font-semibold">Gastos de créditos por modelo</div>
              <div className="space-y-3">
                {stats.creditsByModel.length > 0 ? (
                  stats.creditsByModel.map((m) => (
                    <div key={m.name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{m.name}</span>
                        <span>{m.percent}%</span>
                      </div>
                      <Progress value={m.percent} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum dado de modelo encontrado</p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

