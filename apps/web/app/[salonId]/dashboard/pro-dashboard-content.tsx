"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { CheckCircle2, MessageCircle, Clock, Sparkles } from "lucide-react"
import { StatCard } from "@/components/dashboard/stat-card"
import { AgentList } from "@/components/dashboard/agent-list"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardStats } from "@/app/actions/dashboard"

const ChartSection = dynamic(
  () => import("@/components/dashboard/chart-section").then(m => ({ default: m.ChartSection })),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full rounded-lg" /> }
)

interface ProDashboardContentProps {
  stats: DashboardStats
}

export default function ProDashboardContent({ stats }: ProDashboardContentProps) {
  const [range, setRange] = useState<7 | 14 | 30>(7)

  const chartData = useMemo(() => {
    const data = stats.creditsByDay || []
    if (range === 7) return data.slice(-7)
    if (range === 14) return data.slice(-14)
    return data
  }, [range, stats.creditsByDay])

  const agents = stats.topAgents.map((agent, index) => ({
    id: `agent-${index}`,
    name: agent.name,
    credits: agent.credits,
    model: agent.model,
    role: (agent.name.toLowerCase().includes("bot") || agent.name.toLowerCase().includes("agent") || agent.name.toLowerCase().includes("ia") ? "bot" : "human") as "bot" | "human",
  }))

  return (
    <div className="h-full flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 flex-shrink-0">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">Painel da Operação</h1>
            <span className="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] text-accent font-bold uppercase tracking-wide flex items-center gap-1">
              <Sparkles size={10} /> IA v2 Ativa
            </span>
          </div>
          <p className="text-muted-foreground text-xs lg:text-sm max-w-2xl">
            Monitore atendimentos, consumo e performance dos seus agentes autônomos.
          </p>
        </div>
        <div className="flex gap-4 lg:gap-8 text-left lg:text-right">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Taxa de Resposta</p>
            <p className="text-lg lg:text-xl font-bold text-foreground">{stats.responseRate}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Fila Média</p>
            <p className="text-lg lg:text-xl font-bold text-foreground">{stats.queueAverageTime}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 flex-shrink-0">
        <StatCard title="Atendimentos Concluídos" value={stats.completedAppointments} icon={<CheckCircle2 size={24} />} badgeType="neutral" />
        <StatCard title="Em Andamento" value={stats.activeChats} badgeText={`IA Cobrindo ${stats.responseRate}%`} badgeType="success" icon={<MessageCircle size={24} />} />
        <StatCard title="Tempo Médio" value={stats.averageResponseTime} subtext="Atendimento instantâneo" badgeText={`SLA ${stats.responseRate}%`} badgeType="warning" icon={<Clock size={24} />} />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 min-h-[300px] lg:min-h-0">
          <ChartSection data={chartData} range={range} onRangeChange={setRange} />
        </div>
        <div className="lg:col-span-1 min-h-[300px] lg:min-h-0">
          <AgentList agents={agents} creditsByModel={stats.creditsByModel} />
        </div>
      </div>
    </div>
  )
}
