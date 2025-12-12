"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { X, Clock, Copy, AlertCircle, Save } from "lucide-react"
import { getAvailability, updateAvailability } from "@/app/actions/availability"
import { useSalon } from "@/contexts/salon-context"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  professional: { id: string; name: string }
}

type Item = { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }

const dayNames = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
]

export default function AvailabilitySheet({ open, onOpenChange, professional }: Props) {
  const { activeSalon } = useSalon()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<Item[]>(() => Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, isActive: false, startTime: "09:00", endTime: "18:00" })))

  useEffect(() => {
    if (!open || !activeSalon) return
    startTransition(async () => {
      const res = await getAvailability(professional.id, activeSalon.id)
      if (Array.isArray(res)) {
        const map = new Map<number, { startTime: string; endTime: string }>()
        for (const r of res) map.set(r.dayOfWeek, { startTime: r.startTime, endTime: r.endTime })
        setItems((prev) => prev.map((it) => {
          const m = map.get(it.dayOfWeek)
          if (!m) return { ...it, isActive: false }
          return { dayOfWeek: it.dayOfWeek, isActive: true, startTime: m.startTime, endTime: m.endTime }
        }))
      } else {
        toast.error(res.error)
      }
    })
  }, [open, professional.id, activeSalon?.id])

  const canSave = useMemo(() => {
    for (const it of items) {
      if (!it.isActive) continue
      if (!/^\d{2}:\d{2}$/.test(it.startTime)) return false
      if (!/^\d{2}:\d{2}$/.test(it.endTime)) return false
    }
    return true
  }, [items])

  function copyToWeekdays() {
    const reference = items.find((d) => d.isActive && d.dayOfWeek !== 0 && d.dayOfWeek !== 6)
    if (!reference) return

    setItems((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== 0 && day.dayOfWeek !== 6) {
          return { ...day, isActive: true, startTime: reference.startTime, endTime: reference.endTime }
        }
        return day
      })
    )
  }

  async function onSave() {
    if (!activeSalon) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const payload = items.map((it) => ({ dayOfWeek: it.dayOfWeek, startTime: it.startTime, endTime: it.endTime, isActive: it.isActive }))
      const res = await updateAvailability(professional.id, payload, activeSalon.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Disponibilidade atualizada")
      onOpenChange(false)
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={() => onOpenChange(false)}
      />

      {/* Sheet Content (Slide from Right) */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-white/5 bg-slate-900/50 backdrop-blur-md z-10 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock size={18} className="text-indigo-500" />
              Horários de Trabalho
            </h2>
            <p className="text-sm text-slate-400">
              Editando disponibilidade de <span className="text-white font-medium">{professional.name}</span>
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <div className="mb-6 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex gap-3">
            <AlertCircle size={20} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-indigo-200">
              <p className="mb-1 font-semibold text-indigo-400">Sincronização Inteligente</p>
              <p className="opacity-80">
                Os agendamentos online serão bloqueados automaticamente fora destes intervalos.
              </p>
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <button
              onClick={copyToWeekdays}
              className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-500/10"
              title="Copiar horário do primeiro dia útil para todos os dias de semana"
            >
              <Copy size={12} />
              Replicar seg-sex
            </button>
          </div>

          <div className="space-y-3">
            {items.map((day, index) => (
              <div
                key={day.dayOfWeek}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  day.isActive
                    ? "bg-slate-800/50 border-white/10"
                    : "bg-slate-900 border-white/5 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-sm font-medium ${day.isActive ? "text-white" : "text-slate-500"}`}>
                    {dayNames[day.dayOfWeek]}
                  </span>

                  {/* Toggle Switch */}
                  <button
                    onClick={() =>
                      setItems((prev) =>
                        prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, isActive: !p.isActive } : p))
                      )
                    }
                    className={`w-10 h-5 rounded-full relative transition-colors duration-200 ${
                      day.isActive ? "bg-indigo-600" : "bg-slate-700"
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${
                        day.isActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    ></div>
                  </button>
                </div>

                {day.isActive ? (
                  <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Início</label>
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, startTime: e.target.value } : p))
                          )
                        }
                        className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fim</label>
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, endTime: e.target.value } : p))
                          )
                        }
                        className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 font-mono py-2.5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                    Não trabalha neste dia
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-slate-900/50 backdrop-blur-md z-10 flex gap-3">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={!canSave || isPending}
            className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

