"use client"

import { useMemo } from "react"
import { eachDayOfInterval, isSameDay } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"
import { formatBrazilTime, startOfWeekBrazil, endOfWeekBrazil, startOfDayBrazil, getBrazilNow, getBrazilHours } from "@/lib/utils/timezone.utils"
import { Clock } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { DailyAppointment, ProfessionalInfo } from "@/app/actions/appointments"

interface WeeklySchedulerProps {
  salonId: string
  currentDate: Date
  appointments: DailyAppointment[]
  professionals: ProfessionalInfo[]
  loading: boolean
  error: string | null
  selectedProfessionalId: string | null
  startHour?: number
  endHour?: number
}

const PIXELS_PER_MINUTE = 2
const HOUR_ROW_HEIGHT = 60 * PIXELS_PER_MINUTE // 120px - uma hora em pixels

function calculateAppointmentPosition(
  appointment: DailyAppointment,
  dayStart: Date
): { top: number; height: number } {
  const startTime = appointment.startTime
  const endTime = appointment.endTime

  // dayStart já é o início do dia no timezone de Brasília (convertido para UTC)
  // Não precisamos fazer setHours pois dayStart já está no início do dia
  const referenceTime = dayStart

  // Calcula minutos desde o início do dia (00:00)
  // getTime() retorna timestamp UTC, então a diferença funciona corretamente
  const startMinutes = Math.max(
    0,
    Math.round((startTime.getTime() - referenceTime.getTime()) / (1000 * 60))
  )
  const durationMinutes = Math.round(
    (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  )

  const top = startMinutes * PIXELS_PER_MINUTE
  const height = Math.max(20, durationMinutes * PIXELS_PER_MINUTE)

  return { top, height }
}

const SEQUENCE_COLORS = [
  { bg: "bg-blue-100 dark:bg-blue-600", border: "border-blue-600", text: "text-blue-700 dark:text-blue-200" },
  { bg: "bg-rose-100 dark:bg-rose-500", border: "border-rose-400", text: "text-rose-600 dark:text-rose-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-600", border: "border-emerald-600", text: "text-emerald-700 dark:text-emerald-200" },
  { bg: "bg-sky-100 dark:bg-sky-600", border: "border-sky-600", text: "text-sky-700 dark:text-sky-200" },
  { bg: "bg-amber-100 dark:bg-amber-600", border: "border-amber-600", text: "text-amber-700 dark:text-amber-200" },
] as const

function getSequenceColor(index: number): { bg: string; border: string; text: string } {
  return SEQUENCE_COLORS[index % SEQUENCE_COLORS.length]
}

export function WeeklyScheduler({
  salonId,
  currentDate,
  appointments,
  professionals,
  loading,
  error,
  selectedProfessionalId,
  startHour = 8,
  endHour = 22
}: WeeklySchedulerProps) {
  
  const weekStart = useMemo(() => startOfWeekBrazil(currentDate, { weekStartsOn: 0 }), [currentDate])
  const weekEnd = useMemo(() => endOfWeekBrazil(currentDate, { weekStartsOn: 0 }), [currentDate])
  const weekDays = useMemo(() => {
    // Converte de volta para horário local para exibição
    const start = new Date(weekStart)
    const end = new Date(weekEnd)
    return eachDayOfInterval({ start, end })
  }, [weekStart, weekEnd])

  const appointmentsByProfessional = useMemo(() => {
    const map = new Map<string, DailyAppointment[]>()
    appointments.forEach((apt) => {
      const existing = map.get(apt.professionalId) || []
      map.set(apt.professionalId, [...existing, apt])
    })

    return map
  }, [appointments])

  const selectedProfessional = useMemo(() => {
    if (!selectedProfessionalId || professionals.length === 0) return null
    return professionals.find((p) => p.id === selectedProfessionalId) || null
  }, [selectedProfessionalId, professionals])

  const appointmentsByDay = useMemo(() => {
    if (!selectedProfessionalId) return new Map<string, DailyAppointment[]>()

    const appointments = appointmentsByProfessional.get(selectedProfessionalId) || []
    const map = new Map<string, DailyAppointment[]>()

    appointments.forEach((apt) => {
      // apt.startTime já está em horário de Brasília (convertido por fromBrazilTime)
      // Usa formatBrazilTime para garantir que a chave do dia seja no timezone de Brasília
      const dayKey = formatBrazilTime(apt.startTime, "yyyy-MM-dd")
      const existing = map.get(dayKey) || []
      map.set(dayKey, [...existing, apt])
    })

    return map
  }, [selectedProfessionalId, appointmentsByProfessional])

  // Índice de sequência global por dia (para cores diferentes mesmo em horas diferentes)
  const sequenceIndexByDay = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    appointmentsByDay.forEach((appointments, dayKey) => {
      const sorted = [...appointments].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      const indexMap = new Map<string, number>()
      sorted.forEach((apt, i) => indexMap.set(apt.id, i))
      map.set(dayKey, indexMap)
    })
    return map
  }, [appointmentsByDay])

  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {loading ? (
        <div className="flex-1 bg-card rounded-md border border-border p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 bg-card rounded-md border border-border p-6">
          <div className="text-center text-destructive">{error}</div>
        </div>
      ) : professionals.length === 0 ? (
        <div className="flex-1 bg-card rounded-md border border-border p-6">
          <div className="text-center text-muted-foreground">
            Nenhum profissional ativo encontrado
          </div>
        </div>
      ) : !selectedProfessional ? (
        <div className="flex-1 bg-card rounded-md border border-border p-6">
          <div className="text-center text-muted-foreground">
            Selecione um profissional para visualizar a agenda
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col bg-card rounded-md border border-border">
          {/* Header Row */}
          <div className="flex border-b border-border">
            <div className="w-16 flex-shrink-0 border-r border-border bg-muted/50"></div>
            {weekDays.map((day, i) => (
              <div key={day.toISOString()} className={`flex-1 py-3 text-center text-sm font-semibold text-foreground ${i < weekDays.length - 1 ? 'border-r border-border' : ''}`}>
                <div className="text-xs text-muted-foreground mb-0.5">
                  {formatBrazilTime(day, "EEE", { locale: ptBR })}
                </div>
                <div>
                  {formatBrazilTime(day, "d/M")}
                </div>
                {isSameDay(day, getBrazilNow()) && (
                  <div className="text-[10px] text-accent font-medium mt-0.5">Hoje</div>
                )}
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {hours.map((hour) => (
              <div key={hour} className="flex border-b border-border relative group" style={{ minHeight: `${HOUR_ROW_HEIGHT}px` }}>
                <div className="w-16 flex-shrink-0 border-r border-border bg-muted/30 text-xs text-muted-foreground font-mono text-right pr-3 pt-2">
                  {hour}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  // Converte day para horário de Brasília para comparação consistente
                  const dayKey = formatBrazilTime(day, "yyyy-MM-dd")
                  const dayAppointments = appointmentsByDay.get(dayKey) || []
                  const dayStart = startOfDayBrazil(day)

                  return (
                    <div key={dayIndex} className={`flex-1 relative ${dayIndex < weekDays.length - 1 ? 'border-r border-border' : ''} hover:bg-muted/50 transition-colors`}>
                      {[...dayAppointments]
                        .filter(apt => {
                          const aptHour = getBrazilHours(apt.startTime)
                          return aptHour >= hour && aptHour < hour + 1
                        })
                        .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
                        .map((appointment) => {
                          const { top, height } = calculateAppointmentPosition(appointment, dayStart)
                          const sequenceIndex = sequenceIndexByDay.get(dayKey)?.get(appointment.id) ?? 0
                          const colorScheme = getSequenceColor(sequenceIndex)
                          const hourStartMinutes = hour * 60
                          const relativeTop = top - (hourStartMinutes * PIXELS_PER_MINUTE)
                          
                          return (
                            <div
                              key={appointment.id}
                              className={`absolute left-0 w-full p-2 m-0.5 rounded text-xs font-medium cursor-pointer hover:brightness-110 transition-all z-10 border-l-4 overflow-hidden ${colorScheme.bg} ${colorScheme.border} ${colorScheme.text}`}
                              style={{ 
                                height: `${Math.max(height, 62)}px`,
                                top: `${Math.max(relativeTop, 0)}px`,
                              }}
                              title={`${appointment.clientName || "Cliente"} - ${appointment.serviceName} (${formatBrazilTime(appointment.startTime, "HH:mm")} - ${formatBrazilTime(appointment.endTime, "HH:mm")})`}
                            >
                              <p className="font-bold truncate">{appointment.clientName || "Cliente"}</p>
                              <p className="opacity-80 truncate">{appointment.serviceName}</p>
                              <p className="opacity-80 mt-1 flex items-center gap-1">
                                <Clock size={10} /> {formatBrazilTime(appointment.startTime, "HH:mm")}
                              </p>
                            </div>
                          )
                        })}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
