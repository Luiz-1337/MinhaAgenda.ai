"use client"

import { useMemo } from "react"
import { format, eachDayOfInterval, isSameDay } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"
import { formatBrazilTime, startOfWeekBrazil, endOfWeekBrazil, startOfDayBrazil, getBrazilNow, fromBrazilTime } from "@/lib/utils/timezone.utils"
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
}

const PIXELS_PER_MINUTE = 2

function calculateAppointmentPosition(
  appointment: DailyAppointment,
  dayStart: Date
): { top: number; height: number } {
  const startTime = appointment.startTime
  const endTime = appointment.endTime

  const referenceTime = new Date(dayStart)
  referenceTime.setHours(0, 0, 0, 0)

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

function getStatusColor(status: DailyAppointment["status"]): { bg: string; border: string; text: string } {
  switch (status) {
    case "confirmed":
      return { bg: "bg-indigo-100 dark:bg-indigo-500/20", border: "border-indigo-500", text: "text-indigo-700 dark:text-indigo-200" }
    case "pending":
      return { bg: "bg-pink-100 dark:bg-pink-500/20", border: "border-pink-500", text: "text-pink-700 dark:text-pink-200" }
    case "cancelled":
      return { bg: "bg-red-100 dark:bg-red-500/20", border: "border-red-500", text: "text-red-700 dark:text-red-200" }
    case "completed":
      return { bg: "bg-emerald-100 dark:bg-emerald-500/20", border: "border-emerald-500", text: "text-emerald-700 dark:text-emerald-200" }
    default:
      return { bg: "bg-blue-100 dark:bg-blue-500/20", border: "border-blue-500", text: "text-blue-700 dark:text-blue-200" }
  }
}

export function WeeklyScheduler({
  salonId,
  currentDate,
  appointments,
  professionals,
  loading,
  error,
  selectedProfessionalId
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
      // Usa format diretamente para evitar dupla conversão
      const dayKey = format(apt.startTime, "yyyy-MM-dd")
      const existing = map.get(dayKey) || []
      map.set(dayKey, [...existing, apt])
    })

    return map
  }, [selectedProfessionalId, appointmentsByProfessional])


  const hours = Array.from({ length: 11 }, (_, i) => i + 8) // 8:00 to 18:00

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {loading ? (
        <div className="flex-1 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <div className="text-center text-red-600 dark:text-red-400">{error}</div>
        </div>
      ) : professionals.length === 0 ? (
        <div className="flex-1 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <div className="text-center text-slate-500 dark:text-slate-400">
            Nenhum profissional ativo encontrado
          </div>
        </div>
      ) : !selectedProfessional ? (
        <div className="flex-1 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-6">
          <div className="text-center text-slate-500 dark:text-slate-400">
            Selecione um profissional para visualizar a agenda
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5">
          {/* Header Row */}
          <div className="flex border-b border-slate-200 dark:border-white/5">
            <div className="w-16 flex-shrink-0 border-r border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5"></div>
            {weekDays.map((day, i) => (
              <div key={day.toISOString()} className={`flex-1 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300 ${i < weekDays.length - 1 ? 'border-r border-slate-200 dark:border-white/5' : ''}`}>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                  {formatBrazilTime(day, "EEE", { locale: ptBR })}
                </div>
                <div>
                  {formatBrazilTime(day, "d/M")}
                </div>
                {isSameDay(day, getBrazilNow()) && (
                  <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">Hoje</div>
                )}
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {hours.map((hour) => (
              <div key={hour} className="flex min-h-[80px] border-b border-slate-200 dark:border-white/5 relative group">
                <div className="w-16 flex-shrink-0 border-r border-slate-200 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] text-xs text-slate-400 dark:text-slate-500 font-mono text-right pr-3 pt-2">
                  {hour}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  // Converte day para horário de Brasília para comparação consistente
                  const dayInBrazil = fromBrazilTime(day)
                  const dayKey = format(dayInBrazil, "yyyy-MM-dd")
                  const dayAppointments = appointmentsByDay.get(dayKey) || []
                  const dayStart = startOfDayBrazil(day)

                  return (
                    <div key={dayIndex} className={`flex-1 relative ${dayIndex < weekDays.length - 1 ? 'border-r border-slate-200 dark:border-white/5' : ''} hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors`}>
                      {dayAppointments
                        .filter(apt => {
                          const aptHour = apt.startTime.getHours()
                          return aptHour >= hour && aptHour < hour + 1
                        })
                        .map((appointment) => {
                          const { top, height } = calculateAppointmentPosition(appointment, dayStart)
                          const colorScheme = getStatusColor(appointment.status)
                          const hourStartMinutes = hour * 60
                          const relativeTop = top - (hourStartMinutes * PIXELS_PER_MINUTE)
                          
                          return (
                            <div
                              key={appointment.id}
                              className={`absolute left-0 w-full p-2 m-0.5 rounded text-xs font-medium cursor-pointer hover:brightness-110 transition-all z-10 border-l-4 ${colorScheme.bg} ${colorScheme.border} ${colorScheme.text}`}
                              style={{ 
                                height: `${Math.max(height, 50)}px`,
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
