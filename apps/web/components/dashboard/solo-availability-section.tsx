"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Clock, Copy, Save } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { getSalonAvailability, updateSalonAvailability } from "@/app/actions/salon-availability"
import type { ScheduleItem } from "@/lib/types/availability"

type Props = {
  salonId: string
}

type Item = { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }

const dayNames = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

export default function SoloAvailabilitySection({ salonId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<Item[]>(() =>
    Array.from({ length: 7 }, (_, i) => ({ dayOfWeek: i, isActive: false, startTime: "09:00", endTime: "18:00" }))
  )

  useEffect(() => {
    setIsLoading(true)
    const loadAvailability = async () => {
      try {
        const res = await getSalonAvailability(salonId)
        if (Array.isArray(res)) {
          const itemsToSet = res.length === 7 ? res : Array.from({ length: 7 }, (_, i) => {
            const existing = res.find(r => r.dayOfWeek === i)
            return existing || { dayOfWeek: i, isActive: false, startTime: "09:00", endTime: "18:00" }
          })
          setItems(itemsToSet)
        } else {
          console.error("Erro ao carregar horários:", res.error)
          toast.error(res.error || "Erro ao carregar horários")
        }
      } catch (error) {
        console.error("Erro inesperado:", error)
        toast.error("Erro ao carregar horários")
      } finally {
        setIsLoading(false)
      }
    }
    loadAvailability()
  }, [salonId])

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
    if (!reference) {
      toast.info("Configure pelo menos um dia útil primeiro")
      return
    }

    setItems((prev) =>
      prev.map((day) => {
        if (day.dayOfWeek !== 0 && day.dayOfWeek !== 6) {
          return { ...day, isActive: true, startTime: reference.startTime, endTime: reference.endTime }
        }
        return day
      })
    )
    toast.success("Horários replicados para dias úteis")
  }

  async function onSave() {
    startTransition(async () => {
      const payload = items.map((it) => ({
        dayOfWeek: it.dayOfWeek,
        startTime: it.startTime,
        endTime: it.endTime,
        isActive: it.isActive,
      }))
      const res = await updateSalonAvailability(salonId, payload)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Horários atualizados com sucesso")
    })
  }

  return (
    <div className="bg-[#0B0B0F] border border-white/5 rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#16161E] border border-white/5 rounded-lg">
            <Clock size={18} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Horários de Atendimento</h3>
            <p className="text-xs text-white/60">Configure sua disponibilidade semanal</p>
          </div>
        </div>
        <button
          onClick={copyToWeekdays}
          className="text-xs flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-white/5 border border-white/5"
          title="Copiar horário do primeiro dia útil para todos os dias de semana"
        >
          <Copy size={12} />
          Replicar
        </button>
      </div>

      {/* Grid de Dias */}
      {isLoading ? (
        <div className="text-center py-12 text-white/40">
          Carregando horários...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {items.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`p-4 rounded-xl border transition-all duration-200 ${
                day.isActive
                  ? "bg-[#16161E] border-white/10"
                  : "bg-[#16161E]/50 border-white/5 opacity-60"
              }`}
            >
              {/* Header do Card: Nome do Dia + Toggle */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${day.isActive ? "text-white" : "text-white/50"}`}>
                  {dayNames[day.dayOfWeek]}
                </span>
                <Switch
                  checked={day.isActive}
                  onCheckedChange={(checked) =>
                    setItems((prev) =>
                      prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, isActive: checked } : p))
                    )
                  }
                />
              </div>

              {/* Inputs de Horário */}
              {day.isActive ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/40 uppercase font-semibold tracking-wider">Início</label>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, startTime: e.target.value } : p))
                        )
                      }
                      className="w-full bg-[#0B0B0F] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/40 uppercase font-semibold tracking-wider">Fim</label>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, endTime: e.target.value } : p))
                        )
                      }
                      className="w-full bg-[#0B0B0F] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-white/30 font-medium py-2 text-center">
                  Inativo
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Botão Salvar Fixo */}
      <div className="sticky bottom-0 pt-4 border-t border-white/5 bg-[#0B0B0F] -mx-6 -mb-6 px-6 pb-6">
        <button
          onClick={onSave}
          disabled={!canSave || isPending}
          className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
        >
          <Save size={16} />
          {isPending ? "Salvando..." : "Salvar Horários"}
        </button>
      </div>
    </div>
  )
}
