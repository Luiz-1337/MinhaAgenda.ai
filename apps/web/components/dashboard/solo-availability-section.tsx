"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { toast } from "sonner"
import { Clock, Copy, Save } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { getSalonAvailability, updateSalonAvailability } from "@/app/actions/salon-availability"
import type { ScheduleItem } from "@/lib/types/availability"

type Props = {
  salonId: string
  className?: string
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

export default function SoloAvailabilitySection({ salonId, className }: Props) {
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
    <div className={`bg-card border border-border rounded-md p-6 flex flex-col ${className || ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-muted border border-border rounded-lg">
            <Clock size={18} className="text-accent" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Horários de Atendimento</h3>
            <p className="text-xs text-muted-foreground">Configure sua disponibilidade semanal</p>
          </div>
        </div>
        <button
          onClick={copyToWeekdays}
          className="text-xs flex items-center gap-1.5 text-accent hover:text-accent/80 transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-muted border border-border"
          title="Copiar horário do primeiro dia útil para todos os dias de semana"
        >
          <Copy size={12} />
          Replicar
        </button>
      </div>

      {/* Grid de Dias */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Carregando horários...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((day) => (
            <div
              key={day.dayOfWeek}
              className={`p-4 rounded-md border transition-all duration-200 ${
                day.isActive
                  ? "bg-muted border-border"
                  : "bg-muted/50 border-border opacity-60"
              }`}
            >
              {/* Header do Card: Nome do Dia + Toggle */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${day.isActive ? "text-foreground" : "text-muted-foreground"}`}>
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
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Início</label>
                    <input
                      type="time"
                      value={day.startTime}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, startTime: e.target.value } : p))
                        )
                      }
                      className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Fim</label>
                    <input
                      type="time"
                      value={day.endTime}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((p) => (p.dayOfWeek === day.dayOfWeek ? { ...p, endTime: e.target.value } : p))
                        )
                      }
                      className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring transition-colors"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground font-medium py-2 text-center">
                  Inativo
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Botão Salvar */}
      <div className="flex-shrink-0 pt-4 border-t border-border">
        <button
          onClick={onSave}
          disabled={!canSave || isPending}
          className="w-full px-4 py-3 rounded-md bg-accent hover:bg-accent/90 text-accent-foreground text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} />
          {isPending ? "Salvando..." : "Salvar Horários"}
        </button>
      </div>
    </div>
  )
}
