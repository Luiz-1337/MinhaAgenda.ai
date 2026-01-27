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
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Olá!</h1>
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

      {/* Card principal: Créditos */}
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-sm flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1">
              <Zap size={20} className="text-indigo-500" /> Consumo de Inteligência
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Resumo do seu saldo de créditos</p>
            {credits ? (
              <>
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                  Você utilizou <span className="text-indigo-500 font-bold">{formatCreditsForDisplay(credits.used)} mil</span> até agora.
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                  Você ainda tem <span className="text-emerald-500 font-bold">{formatCreditsForDisplay(credits.remaining)} mil para gastar</span>.
                </p>
                <div className="mt-4 space-y-2">
                  <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-white/5 p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-indigo-400 rounded-full transition-all"
                      style={{ width: `${percentUsed}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span>Início do ciclo</span>
                    <span>{percentUsed.toFixed(0)}% utilizado</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Carregando créditos…</p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:w-72">
            <Link
              href={`/${salonId}/billing`}
              className="text-xs font-bold text-indigo-500 hover:underline"
            >
              Recarregar agora
            </Link>
            <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <BrainCircuit size={18} />
                </div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Previsão</h4>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {daysLeft != null && (
                  <>Com base no seu ritmo, seus créditos devem durar mais <span className="font-bold text-slate-800 dark:text-white">{daysLeft} dias</span>.</>
                )}
                {daysLeft === null && !credits && "Carregando…"}
                {daysLeft === null && credits && avgDaily === 0 && "Sem consumo recente. No ritmo atual, seus créditos não se esgotam."}
                {daysLeft === null && credits && avgDaily > 0 && credits.remaining <= 0 && "Créditos esgotados. Recarregue para continuar."}
                {daysLeft === null && credits && avgDaily > 0 && credits.remaining > 0 && "Previsão em cálculo."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs Compactos no Topo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 flex-shrink-0">
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Agendamentos</p>
          <p className="text-xl font-bold text-white">{stats.completedAppointments}</p>
        </div>
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Tempo resposta</p>
          <p className="text-xl font-bold text-white">{stats.averageResponseTime}</p>
        </div>
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Conversas ativas</p>
          <p className="text-xl font-bold text-white">{stats.activeChats}</p>
        </div>
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Taxa resposta</p>
          <p className="text-xl font-bold text-white">{stats.responseRate}%</p>
        </div>
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Fila média</p>
          <p className="text-xl font-bold text-white">{stats.queueAverageTime}</p>
        </div>
        <div className="bg-[#16161E] border border-white/5 rounded-xl p-4">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Agentes</p>
          <p className="text-xl font-bold text-white">{stats.topAgents.length}</p>
        </div>
      </div>

      {/* Seção de Horários de Atendimento */}
      <SoloAvailabilitySection salonId={salonId} />

    </div>
  )
}
