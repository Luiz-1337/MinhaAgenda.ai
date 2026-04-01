"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Zap, BrainCircuit, Sparkles } from "lucide-react"
import { getRemainingCredits } from "@/app/actions/credits"
import { formatCreditsForDisplay } from "@/lib/utils"
import type { DashboardStats } from "@/app/actions/dashboard"
import SoloAvailabilitySection from "@/components/dashboard/solo-availability-section"

interface SoloDashboardContentProps {
  stats: DashboardStats
  salonId: string
}

export default function SoloDashboardContent({ stats, salonId }: SoloDashboardContentProps) {
  const [credits, setCredits] = useState<{
    remaining: number
    total: number
    used: number
  } | null>(null)

  useEffect(() => {
    let mounted = true
    getRemainingCredits(salonId).then((r) => {
      if (!mounted) return
      if ("error" in r) setCredits(null)
      else setCredits({ remaining: r.remaining, total: r.total, used: r.used })
    })
    const t = setInterval(() => {
      getRemainingCredits(salonId).then((r) => {
        if (!mounted) return
        if (!("error" in r)) setCredits({ remaining: r.remaining, total: r.total, used: r.used })
      })
    }, 60000)
    return () => {
      mounted = false
      clearInterval(t)
    }
  }, [salonId])

  const percentUsed = credits && credits.total > 0 ? Math.min(100, (credits.used / credits.total) * 100) : 0
  const last7 = useMemo(() => (stats.creditsByDay || []).slice(-7), [stats.creditsByDay])
  const avgDaily = useMemo(() => {
    if (last7.length === 0) return 0
    const sum = last7.reduce((a, d) => a + d.value, 0)
    return sum / 7
  }, [last7])
  const daysLeft = useMemo(() => {
    if (!credits || credits.remaining <= 0 || avgDaily <= 0) return null
    return Math.floor(credits.remaining / avgDaily)
  }, [credits, avgDaily])

  const agents = useMemo(
    () =>
      stats.topAgents.map((a, i) => ({
        id: `agent-${i}`,
        name: a.name,
        credits: a.credits,
        model: a.model,
        role: "bot" as const,
      })),
    [stats.topAgents]
  )

  return (
    <div className="flex flex-col gap-6 h-full overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex justify-between items-end flex-shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Olá, {stats.userName}!</h1>
            <Sparkles size={20} className="text-amber-500" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Sua operação em um só lugar. Dados em tempo real.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</p>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Ativo</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Coluna Esquerda - Créditos e KPIs */}
        <div className="lg:col-span-7 flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">
          {/* Card principal: Créditos - Layout Horizontal */}
          <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-2xl p-5 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative z-10">
              {/* Header com título e botão */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                    <Zap size={16} className="text-indigo-500" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Consumo de Inteligência</h3>
                </div>
                <Link
                  href={`/${salonId}/billing`}
                  className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  Recarregar
                </Link>
              </div>

              {credits ? (
                <div className="space-y-4">
                  {/* Números e Previsão */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Coluna 1-2: Créditos */}
                    <div className="sm:col-span-2 space-y-3">
                      <div className="flex items-baseline gap-4">
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Disponível</p>
                          <p className="text-2xl font-bold text-emerald-500">{formatCreditsForDisplay(credits.remaining)}</p>
                        </div>
                        <div className="h-8 w-px bg-slate-200 dark:bg-white/10" />
                        <div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Utilizado</p>
                          <p className="text-2xl font-bold text-indigo-500">{formatCreditsForDisplay(credits.used)}</p>
                        </div>
                      </div>
                      {/* Barra de progresso */}
                      <div className="space-y-1.5">
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-500"
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-medium text-slate-400">
                          <span>0%</span>
                          <span className="font-bold text-slate-600 dark:text-slate-300">{percentUsed.toFixed(0)}% do ciclo</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 3: Previsão */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                      <BrainCircuit size={20} className="text-indigo-500 mb-1.5" />
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-0.5">Previsão</p>
                      {daysLeft != null ? (
                        <p className="text-xl font-bold text-slate-800 dark:text-white">{daysLeft} <span className="text-xs font-medium text-slate-400">dias</span></p>
                      ) : (
                        <p className="text-xs text-slate-400">
                          {avgDaily === 0 ? "∞" : credits.remaining <= 0 ? "0" : "..."}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Textos descritivos */}
                  <div className="pt-3 border-t border-slate-100 dark:border-white/5 space-y-1">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Você utilizou <span className="text-indigo-500 font-semibold">{formatCreditsForDisplay(credits.used)}</span> até agora.
                      {" "}Ainda tem <span className="text-emerald-500 font-semibold">{formatCreditsForDisplay(credits.remaining)}</span> para gastar.
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {daysLeft != null && (
                        <>Com base no seu ritmo, seus créditos devem durar mais <span className="font-semibold text-slate-700 dark:text-slate-200">{daysLeft} dias</span>.</>
                      )}
                      {daysLeft === null && avgDaily === 0 && "Sem consumo recente. No ritmo atual, seus créditos não se esgotam."}
                      {daysLeft === null && avgDaily > 0 && credits.remaining <= 0 && "Créditos esgotados. Recarregue para continuar."}
                      {daysLeft === null && avgDaily > 0 && credits.remaining > 0 && "Calculando previsão..."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-pulse flex items-center gap-2 text-slate-400">
                    <div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
                    <span className="text-sm">Carregando créditos...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KPIs Compactos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Agendamentos</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.completedAppointments}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Tempo resposta</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.averageResponseTime}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Conversas ativas</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.activeChats}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Taxa resposta</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.responseRate}%</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Fila média</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.queueAverageTime}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-4">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mb-1">Agentes</p>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{stats.topAgents.length}</p>
            </div>
          </div>
        </div>

        {/* Coluna Direita - Horários de Atendimento */}
        <div className="lg:col-span-5 h-full overflow-y-auto custom-scrollbar">
          <SoloAvailabilitySection salonId={salonId} className="h-full" />
        </div>
      </div>
    </div>
  )
}
