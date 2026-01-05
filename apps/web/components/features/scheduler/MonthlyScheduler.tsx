"use client"

import { useMemo } from "react"
import { eachDayOfInterval, isSameDay, isSameMonth } from "date-fns"
import { formatBrazilTime, startOfMonthBrazil, endOfMonthBrazil, startOfWeekBrazil, endOfWeekBrazil, getBrazilNow } from "@/lib/utils/timezone.utils"
import { Skeleton } from "@/components/ui/skeleton"
import type { DailyAppointment, ProfessionalInfo } from "@/app/actions/appointments"

interface MonthlySchedulerProps {
  salonId: string
  currentDate: Date
  appointments: DailyAppointment[]
  professionals: ProfessionalInfo[]
  loading: boolean
  error: string | null
  selectedProfessionalId: string | null
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

export function MonthlyScheduler({ 
  salonId, 
  currentDate, 
  appointments, 
  professionals, 
  loading, 
  error,
  selectedProfessionalId
}: MonthlySchedulerProps) {

  const monthStart = useMemo(() => startOfMonthBrazil(currentDate), [currentDate])
  const monthEnd = useMemo(() => endOfMonthBrazil(currentDate), [currentDate])
  
  // Calendário começa no domingo da semana que contém o primeiro dia do mês
  const calendarStart = useMemo(() => startOfWeekBrazil(monthStart, { weekStartsOn: 0 }), [monthStart])
  const calendarEnd = useMemo(() => endOfWeekBrazil(monthEnd, { weekStartsOn: 0 }), [monthEnd])
  const calendarDays = useMemo(() => {
    // Converte de volta para horário local para exibição
    const start = new Date(calendarStart)
    const end = new Date(calendarEnd)
    return eachDayOfInterval({ start, end })
  }, [calendarStart, calendarEnd])

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

  const weekDayNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
  const weekDayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

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
        <div className="flex-1 bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 p-4 overflow-hidden flex flex-col">
          <div className="grid grid-cols-7 gap-4 h-full">
            {weekDayNames.map((d, index) => (
              <div key={weekDayKeys[index]} className="text-center text-sm font-bold text-slate-400 dark:text-slate-500 mb-2">{d}</div>
            ))}
            {calendarDays.map((day) => {
              // Converte day para horário de Brasília para comparação consistente
              const dayKey = formatBrazilTime(day, "yyyy-MM-dd")
              const dayAppointments = appointmentsByDay.get(dayKey) || []
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isToday = isSameDay(day, getBrazilNow())
              const hasEvent = dayAppointments.length > 0
              
              return (
                <div 
                  key={day.toISOString()} 
                  className={`
                    border rounded-xl p-2 relative flex flex-col justify-between transition-all
                    ${isCurrentMonth 
                      ? 'border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] hover:border-indigo-500/50 cursor-pointer' 
                      : 'border-transparent opacity-30'}
                  `}
                >
                  {isCurrentMonth && (
                    <>
                      <span className={`text-sm font-medium ${isToday ? 'text-indigo-500 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>
                        {formatBrazilTime(day, "d")}
                      </span>
                      {hasEvent && (
                        <div className="space-y-1 mt-1">
                          {dayAppointments.slice(0, 2).map((appointment) => {
                            const colorScheme = getStatusColor(appointment.status)
                            return (
                              <div 
                                key={appointment.id}
                                className={`h-1.5 w-full ${colorScheme.bg.replace('bg-', 'bg-').replace('/20', '/40')} rounded-full`}
                                title={`${appointment.clientName || "Cliente"} - ${formatBrazilTime(appointment.startTime, "HH:mm")}`}
                              ></div>
                            )
                          })}
                          {dayAppointments.length > 2 && (
                            <div className="h-1.5 w-2/3 bg-slate-400/40 dark:bg-slate-500/40 rounded-full"></div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
