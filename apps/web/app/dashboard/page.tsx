"use client"

import { useMemo, useState } from "react"
import { cn } from "@/lib/utils"
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

type Point = { date: string; value: number }

const data7: Point[] = [
  { date: "01/12", value: 24 },
  { date: "02/12", value: 32 },
  { date: "03/12", value: 28 },
  { date: "04/12", value: 36 },
  { date: "05/12", value: 31 },
  { date: "06/12", value: 40 },
  { date: "07/12", value: 35 },
]

const data14: Point[] = [
  { date: "25/11", value: 18 },
  { date: "26/11", value: 22 },
  { date: "27/11", value: 20 },
  { date: "28/11", value: 26 },
  { date: "29/11", value: 19 },
  { date: "30/11", value: 23 },
  ...data7,
  { date: "08/12", value: 38 },
]

const data30: Point[] = Array.from({ length: 30 }).map((_, i) => {
  const day = (i + 1).toString().padStart(2, "0")
  return { date: `${day}/11`, value: 10 + Math.round(Math.random() * 35) }
}).slice(0, 22).concat(
  [
    { date: "23/11", value: 22 },
    { date: "24/11", value: 28 },
  ],
  data14
)

const agents = [
  { name: "Ana Souza", credits: 124 },
  { name: "Carlos Lima", credits: 109 },
  { name: "Beatriz Nunes", credits: 95 },
  { name: "Diego Ramos", credits: 88 },
]

const models = [
  { name: "gpt-4o-mini", percent: 62 },
  { name: "gpt-4.1", percent: 24 },
  { name: "gpt-4o", percent: 14 },
]

export default function DashboardHomePage() {
  const [range, setRange] = useState<7 | 14 | 30>(7)
  const series = useMemo(() => {
    if (range === 7) return data7
    if (range === 14) return data14
    return data30
  }, [range])

  return (
    <div className="space-y-8">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-800/50 p-6 shadow-[0_20px_80px_rgba(99,102,241,0.18)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-cyan-400/40 bg-cyan-400/10 text-cyan-100">IA v2 ativa</Badge>
              <Badge className="border-white/15 bg-white/5 text-slate-100">Fluxo estável</Badge>
              <Badge className="border-indigo-400/40 bg-indigo-500/10 text-indigo-100">Realtime</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">Painel da operação</h1>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                Dados em tempo real + IA
              </span>
            </div>
            <p className="max-w-2xl text-sm text-slate-300">
              Monitore atendimentos, consumo de créditos e performance dos agentes em uma interface mais imersiva.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button className="bg-gradient-to-r from-cyan-500 via-indigo-500 to-fuchsia-500 text-white shadow-lg shadow-cyan-500/25 hover:brightness-110">
                Criar nova campanha
              </Button>
              <Button
                variant="outline"
                className="border-white/20 bg-white/5 text-white hover:border-cyan-400/60 hover:text-cyan-50"
              >
                Ver agenda ao vivo
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-right text-slate-200">
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Taxa de resposta</div>
              <div className="text-2xl font-semibold text-cyan-100">98%</div>
              <div className="text-xs text-emerald-300">+4% semanal</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-slate-400">Fila média</div>
              <div className="text-2xl font-semibold text-amber-100">1m 12s</div>
              <div className="text-xs text-emerald-300">-18% vs ontem</div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400/80 shadow-[0_0_0_6px_rgba(34,211,238,0.12)]" />
          Infra saudável • Última sincronização há 25s
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-white/10 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-slate-900/70 p-4 text-white shadow-lg shadow-cyan-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-cyan-500/20 p-2 text-cyan-200 ring-1 ring-cyan-400/40">
                <CheckCircle className="size-5" />
              </div>
              <div>
                <div className="text-sm text-slate-300">Atendimentos concluídos</div>
                <div className="text-2xl font-semibold">110</div>
              </div>
            </div>
            <Badge className="border-emerald-300/60 bg-emerald-500/15 text-emerald-100">+58%</Badge>
          </div>
        </Card>
        <Card className="border-white/10 bg-gradient-to-br from-indigo-500/15 via-indigo-500/5 to-slate-900/70 p-4 text-white shadow-lg shadow-indigo-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-500/20 p-2 text-indigo-200 ring-1 ring-indigo-400/50">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <div className="text-sm text-slate-300">Atendimentos em andamento</div>
                <div className="text-2xl font-semibold">72</div>
              </div>
            </div>
            <Badge className="border-white/15 bg-white/10 text-white">IA cobrindo 64%</Badge>
          </div>
        </Card>
        <Card className="border-white/10 bg-gradient-to-br from-amber-400/15 via-amber-400/8 to-slate-900/70 p-4 text-white shadow-lg shadow-amber-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-400/25 p-2 text-amber-100 ring-1 ring-amber-300/60">
                <Clock className="size-5" />
              </div>
              <div>
                <div className="text-sm text-slate-300">Tempo médio de atendimento</div>
                <div className="text-2xl font-semibold">7h 40m</div>
              </div>
            </div>
            <Badge className="border-white/15 bg-white/5 text-white">SLA 92%</Badge>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-white/10 bg-slate-900/70 p-4 text-white shadow-[0_10px_60px_rgba(15,23,42,0.35)] lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Gastos de créditos por dia</div>
              <p className="text-xs text-slate-300">Monitorando consumo em {range} dias</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className={cn(
                  "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/60 hover:text-white",
                  range === 7 && "border-cyan-400/60 text-white"
                )}
                onClick={() => setRange(7)}
              >
                7d
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/60 hover:text-white",
                  range === 14 && "border-cyan-400/60 text-white"
                )}
                onClick={() => setRange(14)}
              >
                14d
              </Button>
              <Button
                variant="outline"
                className={cn(
                  "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-400/60 hover:text-white",
                  range === 30 && "border-cyan-400/60 text-white"
                )}
                onClick={() => setRange(30)}
              >
                30d
              </Button>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#e2e8f0" }} />
                <YAxis tick={{ fontSize: 12, fill: "#e2e8f0" }} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)" }}
                  cursor={{ stroke: "rgba(94,234,212,0.35)", strokeWidth: 1.5 }}
                />
                <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-white/10 bg-slate-900/70 p-4 text-white shadow-[0_10px_60px_rgba(15,23,42,0.35)]">
          <div className="space-y-6">
            <div>
              <div className="mb-3 text-sm font-medium text-white">Top agentes</div>
              <div className="space-y-3">
                {agents.map((a) => (
                  <div key={a.name} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="ring-1 ring-white/10">
                        <AvatarFallback className="bg-slate-800 text-white">
                          {a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-sm text-slate-100">{a.name}</div>
                    </div>
                    <div className="text-sm font-medium text-cyan-100">{a.credits} créditos</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 text-sm font-medium text-white">Gastos de créditos por modelo</div>
              <div className="space-y-4">
                {models.map((m) => (
                  <div key={m.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{m.name}</span>
                      <span className="font-medium text-white">{m.percent}%</span>
                    </div>
                    <Progress value={m.percent} className="h-2 bg-white/10" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
