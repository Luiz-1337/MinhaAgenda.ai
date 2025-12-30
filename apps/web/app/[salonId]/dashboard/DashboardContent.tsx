"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, MessageCircle, Clock, Sparkles } from "lucide-react"
import { StatCard } from "@/components/dashboard/stat-card"
import { AgentList } from "@/components/dashboard/agent-list"
import { ChartSection } from "@/components/dashboard/chart-section"
import type { DashboardStats } from "@/app/actions/dashboard"

interface DashboardContentProps {
  stats: DashboardStats
}

export default function DashboardContent({ stats }: DashboardContentProps) {
  const [range, setRange] = useState<7 | 14 | 30>(7)
  
  const chartData = useMemo(() => {
    const data = stats.creditsByDay || []
    if (range === 7) return data.slice(-7)
    if (range === 14) return data.slice(-14)
    return data
  }, [range, stats.creditsByDay])

  // Calcula variação percentual




  // Transforma topAgents para o formato esperado pelo AgentList
  const agents = stats.topAgents.map((agent, index) => ({
    id: `agent-${index}`,
    name: agent.name,
    credits: agent.credits,
    model: agent.model,
    role: agent.name.toLowerCase().includes('bot') || agent.name.toLowerCase().includes('agent') || agent.name.toLowerCase().includes('ia') ? 'bot' as const : 'human' as const,
  }))

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex justify-between items-end flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Painel da Operação</h1>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wide flex items-center gap-1">
              <Sparkles size={10} /> IA v2 Ativa
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-2xl">
            Monitore atendimentos, consumo e performance dos seus agentes autônomos.
          </p>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold mb-0.5">
              Taxa de Resposta
            </p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">
              {stats.responseRate}%{" "}

            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold mb-0.5">
              Fila Média
            </p>
            <p className="text-xl font-bold text-slate-800 dark:text-white">
              {stats.queueAverageTime}{" "}

            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-6 flex-shrink-0">
        <StatCard
          title="Atendimentos Concluídos"
          value={stats.completedAppointments}

          icon={<CheckCircle2 size={24} />}
          badgeType="neutral"
        />
        <StatCard
          title="Em Andamento"
          value={stats.activeChats}
          badgeText={`IA Cobrindo ${stats.responseRate}%`}
          badgeType="success"
          icon={<MessageCircle size={24} />}
        />
        <StatCard
          title="Tempo Médio"
          value={stats.averageResponseTime}
          subtext="Atendimento instantâneo"
          badgeText={`SLA ${stats.responseRate}%`}
          badgeType="warning"
          icon={<Clock size={24} />}
        />
      </div>

      {/* Main Visualizations (Fills remaining height) */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-6">
        <div className="col-span-2 min-h-0">
          <ChartSection data={chartData} range={range} onRangeChange={setRange} />
        </div>
        <div className="col-span-1 min-h-0">
          <AgentList agents={agents} creditsByModel={stats.creditsByModel} />
        </div>
      </div>
    </div>
  )
}

