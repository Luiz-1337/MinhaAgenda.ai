"use client"

import { useState, useEffect, useMemo } from "react"
import { format, addMonths, subMonths, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"
import { formatBrazilTime, startOfMonthBrazil, endOfMonthBrazil, startOfWeekBrazil, endOfWeekBrazil, getBrazilNow } from "@/lib/utils/timezone.utils"
import { ChevronLeft, ChevronRight, Calendar, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DailyAppointment, ProfessionalInfo, MonthlyAppointmentsResult } from "@/app/actions/appointments"
import { getMonthlyAppointments } from "@/app/actions/appointments"

interface MonthlySchedulerProps {
  salonId: string
  initialDate?: Date | string
}

function getStatusColor(status: DailyAppointment["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
    case "pending":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"
    case "cancelled":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
    case "completed":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
    default:
      return "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20"
  }
}

export function MonthlyScheduler({ salonId, initialDate }: MonthlySchedulerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDate ? (typeof initialDate === "string" ? parseISO(initialDate) : initialDate) : getBrazilNow()
  )
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const [data, setData] = useState<MonthlyAppointmentsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const monthStart = useMemo(() => startOfMonthBrazil(selectedDate), [selectedDate])
  const monthEnd = useMemo(() => endOfMonthBrazil(selectedDate), [selectedDate])
  
  // Calendário começa no domingo da semana que contém o primeiro dia do mês
  const calendarStart = useMemo(() => startOfWeekBrazil(monthStart, { weekStartsOn: 0 }), [monthStart])
  const calendarEnd = useMemo(() => endOfWeekBrazil(monthEnd, { weekStartsOn: 0 }), [monthEnd])
  const calendarDays = useMemo(() => {
    // Converte de volta para horário local para exibição
    const start = new Date(calendarStart)
    const end = new Date(calendarEnd)
    return eachDayOfInterval({ start, end })
  }, [calendarStart, calendarEnd])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const result = await getMonthlyAppointments(salonId, selectedDate)
        if ("error" in result) {
          setError(result.error)
          setData(null)
        } else {
          setData(result)
        }
      } catch (err) {
        setError("Erro ao carregar agendamentos")
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [salonId, selectedDate])

  const appointmentsByProfessional = useMemo(() => {
    if (!data) return new Map<string, DailyAppointment[]>()

    const map = new Map<string, DailyAppointment[]>()
    data.appointments.forEach((apt) => {
      const existing = map.get(apt.professionalId) || []
      map.set(apt.professionalId, [...existing, apt])
    })

    return map
  }, [data])

  const activeProfessionals = useMemo(() => {
    if (!data) return []
    return data.professionals.filter((p) => p.isActive)
  }, [data])

  useEffect(() => {
    if (activeProfessionals.length > 0 && !selectedProfessionalId) {
      setSelectedProfessionalId(activeProfessionals[0].id)
    }
  }, [activeProfessionals, selectedProfessionalId])

  const selectedProfessional = useMemo(() => {
    if (!selectedProfessionalId || !data) return null
    return activeProfessionals.find((p) => p.id === selectedProfessionalId) || null
  }, [selectedProfessionalId, activeProfessionals, data])

  const appointmentsByDay = useMemo(() => {
    if (!selectedProfessionalId || !data) return new Map<string, DailyAppointment[]>()

    const appointments = appointmentsByProfessional.get(selectedProfessionalId) || []
    const map = new Map<string, DailyAppointment[]>()

    appointments.forEach((apt) => {
      const dayKey = formatBrazilTime(apt.startTime, "yyyy-MM-dd")
      const existing = map.get(dayKey) || []
      map.set(dayKey, [...existing, apt])
    })

    return map
  }, [selectedProfessionalId, appointmentsByProfessional, data])

  const handlePreviousMonth = () => {
    setSelectedDate((prev) => subMonths(prev, 1))
  }

  const handleNextMonth = () => {
    setSelectedDate((prev) => addMonths(prev, 1))
  }

  const handleToday = () => {
    setSelectedDate(getBrazilNow())
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value ? parseISO(e.target.value) : new Date()
    setSelectedDate(newDate)
  }

  // Agrupa os dias em semanas (7 dias por semana)
  const weeks = useMemo(() => {
    const weeksArray: Date[][] = []
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeksArray.push(calendarDays.slice(i, i + 7))
    }
    return weeksArray
  }, [calendarDays])

  const weekDayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousMonth}
                disabled={loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={handleToday}
                disabled={loading}
              >
                Hoje
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNextMonth}
                disabled={loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={handleDateChange}
                className="w-auto"
                disabled={loading}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {formatBrazilTime(selectedDate, "MMMM 'de' yyyy")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedProfessionalId || undefined}
              onValueChange={setSelectedProfessionalId}
              disabled={loading || activeProfessionals.length === 0}
            >
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Selecione um profissional" />
              </SelectTrigger>
              <SelectContent>
                {activeProfessionals.map((professional) => (
                  <SelectItem key={professional.id} value={professional.id}>
                    {professional.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-[600px] w-full" />
          </div>
        </Card>
      ) : error ? (
        <Card className="p-6">
          <div className="text-center text-destructive">{error}</div>
        </Card>
      ) : !data || activeProfessionals.length === 0 ? (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            Nenhum profissional ativo encontrado
          </div>
        </Card>
      ) : !selectedProfessional ? (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            Selecione um profissional para visualizar a agenda
          </div>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden flex-1 flex flex-col">
          <div className="flex flex-col flex-1 min-h-0">
            <div className="grid border-b sticky top-0 bg-background z-10" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
              {weekDayNames.map((dayName) => (
                <div key={dayName} className="p-3 border-r last:border-r-0 text-center font-semibold bg-muted/50 text-sm">
                  {dayName}
                </div>
              ))}
            </div>

            <div className="overflow-y-auto flex-1" style={{ maxHeight: "calc(100vh - 350px)" }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                {calendarDays.map((day) => {
                  const dayKey = formatBrazilTime(day, "yyyy-MM-dd")
                  const dayAppointments = appointmentsByDay.get(dayKey) || []
                  const isCurrentMonth = isSameMonth(day, selectedDate)
                  const isToday = isSameDay(day, getBrazilNow())

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[120px] border-r border-b last:border-r-0 p-2 ${
                        !isCurrentMonth ? "bg-muted/20 text-muted-foreground" : "bg-background"
                      } ${isToday ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${isToday ? "text-primary" : ""}`}>
                        {formatBrazilTime(day, "d")}
                      </div>
                      <div className="space-y-1">
                        {dayAppointments.slice(0, 3).map((appointment) => (
                          <div
                            key={appointment.id}
                            className={`text-xs p-1.5 rounded border-l-2 cursor-pointer hover:opacity-80 transition-opacity truncate ${
                              getStatusColor(appointment.status)
                            }`}
                            style={{
                              borderLeftColor: getStatusColor(appointment.status).includes("green")
                                ? "rgb(34 197 94)"
                                : getStatusColor(appointment.status).includes("yellow")
                                ? "rgb(234 179 8)"
                                : getStatusColor(appointment.status).includes("red")
                                ? "rgb(239 68 68)"
                                : "rgb(59 130 246)",
                            }}
                            title={`${appointment.clientName || "Cliente"} - ${appointment.serviceName} (${formatBrazilTime(appointment.startTime, "HH:mm")})`}
                          >
                            <div className="font-semibold truncate">
                              {formatBrazilTime(appointment.startTime, "HH:mm")}
                            </div>
                            <div className="truncate">
                              {appointment.clientName || "Cliente"}
                            </div>
                          </div>
                        ))}
                        {dayAppointments.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1.5">
                            +{dayAppointments.length - 3} mais
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

