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
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Olá, {stats.userName}!</h1>
            <Sparkles size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-muted-foreground text-sm">Sua operação em um só lugar. Dados em tempo real.</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Status</p>
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-full">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Ativo</span>
          </div>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        {/* Coluna Esquerda - Créditos e KPIs */}
        <div className="lg:col-span-7 flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">
          {/* Card principal: Créditos - Layout Horizontal */}
          <div className="bg-card border border-border rounded-md p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 rounded-full -mr-16 -mt-16" />
            <div className="relative z-10">
              {/* Header com título e botão */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-accent/10 rounded-lg">
                    <Zap size={16} className="text-accent" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Consumo de Inteligência</h3>
                </div>
                <Link
                  href={`/${salonId}/billing`}
                  className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
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
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Disponível</p>
                          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCreditsForDisplay(credits.remaining)}</p>
                        </div>
                        <div className="h-8 w-px bg-border" />
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Utilizado</p>
                          <p className="text-2xl font-bold text-accent">{formatCreditsForDisplay(credits.used)}</p>
                        </div>
                      </div>
                      {/* Barra de progresso */}
                      <div className="space-y-1.5">
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${percentUsed}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                          <span>0%</span>
                          <span className="font-bold text-foreground">{percentUsed.toFixed(0)}% do ciclo</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    {/* Coluna 3: Previsão */}
                    <div className="bg-muted rounded-md p-3 flex flex-col items-center justify-center text-center">
                      <BrainCircuit size={20} className="text-accent mb-1.5" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">Previsão</p>
                      {daysLeft != null ? (
                        <p className="text-xl font-bold text-foreground">{daysLeft} <span className="text-xs font-medium text-muted-foreground">dias</span></p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {avgDaily === 0 ? "∞" : credits.remaining <= 0 ? "0" : "..."}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Textos descritivos */}
                  <div className="pt-3 border-t border-border space-y-1">
                    <p className="text-sm text-foreground">
                      Você utilizou <span className="text-accent font-semibold">{formatCreditsForDisplay(credits.used)}</span> até agora.
                      {" "}Ainda tem <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{formatCreditsForDisplay(credits.remaining)}</span> para gastar.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {daysLeft != null && (
                        <>Com base no seu ritmo, seus créditos devem durar mais <span className="font-semibold text-foreground">{daysLeft} dias</span>.</>
                      )}
                      {daysLeft === null && avgDaily === 0 && "Sem consumo recente. No ritmo atual, seus créditos não se esgotam."}
                      {daysLeft === null && avgDaily > 0 && credits.remaining <= 0 && "Créditos esgotados. Recarregue para continuar."}
                      {daysLeft === null && avgDaily > 0 && credits.remaining > 0 && "Calculando previsão..."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-primary rounded-full animate-spin" />
                    <span className="text-sm">Carregando créditos...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* KPIs Compactos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Agendamentos</p>
              <p className="text-xl font-bold text-foreground">{stats.completedAppointments}</p>
            </div>
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Tempo resposta</p>
              <p className="text-xl font-bold text-foreground">{stats.averageResponseTime}</p>
            </div>
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Conversas ativas</p>
              <p className="text-xl font-bold text-foreground">{stats.activeChats}</p>
            </div>
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Taxa resposta</p>
              <p className="text-xl font-bold text-foreground">{stats.responseRate}%</p>
            </div>
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Fila média</p>
              <p className="text-xl font-bold text-foreground">{stats.queueAverageTime}</p>
            </div>
            <div className="bg-card border border-border rounded-md p-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Agentes</p>
              <p className="text-xl font-bold text-foreground">{stats.topAgents.length}</p>
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
