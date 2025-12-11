"use client"

import { useState, useEffect, useMemo } from "react"
import { format, addDays, subDays, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"
import { formatBrazilTime, startOfDayBrazil, getBrazilNow } from "@/lib/utils/timezone.utils"
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
import type { DailyAppointment, ProfessionalInfo, DailyAppointmentsResult } from "@/app/actions/appointments"
import { getDailyAppointments } from "@/app/actions/appointments"

interface DailySchedulerProps {
  salonId: string
  initialDate?: Date | string
}

// Configuração de horários (00:00 às 23:30, passo de 30min - 24 horas completas)
const START_HOUR = 0
const END_HOUR = 23
const SLOT_DURATION_MINUTES = 30
const PIXELS_PER_MINUTE = 2 // Altura de cada minuto em pixels

// Gera os slots de horário (00:00 até 23:30)
function generateTimeSlots(): Date[] {
  const slots: Date[] = []
  const baseDate = new Date()
  baseDate.setHours(0, 0, 0, 0)

  // Gera slots das 00:00 até 23:30 (24 horas completas)
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += SLOT_DURATION_MINUTES) {
      const slot = new Date(baseDate)
      slot.setHours(hour, minute, 0, 0)
      slots.push(slot)
    }
  }

  return slots
}

// Calcula a posição vertical de um agendamento
function calculateAppointmentPosition(
  appointment: DailyAppointment,
  dayStart: Date
): { top: number; height: number } {
  const startTime = appointment.startTime
  const endTime = appointment.endTime

  // Cria uma data de referência no início do dia (00:00)
  const referenceTime = new Date(dayStart)
  referenceTime.setHours(0, 0, 0, 0)

  // Calcula minutos desde o início do dia (00:00)
  const startMinutes = Math.max(
    0,
    Math.round((startTime.getTime() - referenceTime.getTime()) / (1000 * 60))
  )
  const durationMinutes = Math.round(
    (endTime.getTime() - startTime.getTime()) / (1000 * 60)
  )

  const top = startMinutes * PIXELS_PER_MINUTE
  const height = Math.max(20, durationMinutes * PIXELS_PER_MINUTE) // Mínimo de 20px

  return { top, height }
}

// Obtém a cor do badge baseado no status
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

export function DailyScheduler({ salonId, initialDate }: DailySchedulerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialDate ? (typeof initialDate === "string" ? parseISO(initialDate) : initialDate) : getBrazilNow()
  )
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string | null>(null)
  const [data, setData] = useState<DailyAppointmentsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const timeSlots = useMemo(() => generateTimeSlots(), [])
  const dayStart = useMemo(() => startOfDayBrazil(selectedDate), [selectedDate])

  // Busca os dados quando a data muda
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        const result = await getDailyAppointments(salonId, selectedDate)
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

  // Agrupa agendamentos por profissional
  const appointmentsByProfessional = useMemo(() => {
    if (!data) return new Map<string, DailyAppointment[]>()

    const map = new Map<string, DailyAppointment[]>()
    data.appointments.forEach((apt) => {
      const existing = map.get(apt.professionalId) || []
      map.set(apt.professionalId, [...existing, apt])
    })

    return map
  }, [data])

  // Filtra apenas profissionais ativos
  const activeProfessionals = useMemo(() => {
    if (!data) return []
    return data.professionals.filter((p) => p.isActive)
  }, [data])

  // Define o profissional selecionado automaticamente quando os dados carregam
  useEffect(() => {
    if (activeProfessionals.length > 0 && !selectedProfessionalId) {
      setSelectedProfessionalId(activeProfessionals[0].id)
    }
  }, [activeProfessionals, selectedProfessionalId])

  // Obtém o profissional selecionado
  const selectedProfessional = useMemo(() => {
    if (!selectedProfessionalId || !data) return null
    return activeProfessionals.find((p) => p.id === selectedProfessionalId) || null
  }, [selectedProfessionalId, activeProfessionals, data])

  // Obtém os agendamentos do profissional selecionado
  const selectedProfessionalAppointments = useMemo(() => {
    if (!selectedProfessionalId || !data) return []
    return appointmentsByProfessional.get(selectedProfessionalId) || []
  }, [selectedProfessionalId, appointmentsByProfessional, data])

  const handlePreviousDay = () => {
    setSelectedDate((prev) => subDays(prev, 1))
  }

  const handleNextDay = () => {
    setSelectedDate((prev) => addDays(prev, 1))
  }

  const handleToday = () => {
    setSelectedDate(getBrazilNow())
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value ? parseISO(e.target.value) : new Date()
    setSelectedDate(newDate)
  }

  // Calcula a altura total do grid (24 horas = 1440 minutos)
  const gridHeight = 24 * 60 * PIXELS_PER_MINUTE

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      {/* Header com controles de data e seleção de profissional */}
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          {/* Primeira linha: Controles de data */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousDay}
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
                onClick={handleNextDay}
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
              {formatBrazilTime(selectedDate, "EEEE, d 'de' MMMM 'de' yyyy")}
            </div>
          </div>

          {/* Segunda linha: Seleção de profissional */}
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

      {/* Grid de agendamentos */}
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
            {/* Header com nome do profissional */}
            <div className="grid border-b sticky top-0 bg-background z-10" style={{ gridTemplateColumns: "120px 1fr" }}>
              <div className="p-4 border-r font-semibold bg-muted/50">
                Horário
              </div>
              <div className="p-4 text-center font-semibold bg-muted/50">
                {selectedProfessional.name}
              </div>
            </div>

            {/* Grid principal com horários e agendamentos */}
            <div className="overflow-y-auto flex-1" style={{ maxHeight: "calc(100vh - 350px)" }}>
              <div className="relative" style={{ height: `${gridHeight}px` }}>
                {/* Linhas de horário */}
                <div className="absolute inset-0">
                  {timeSlots.map((slot, index) => {
                    const top = index * SLOT_DURATION_MINUTES * PIXELS_PER_MINUTE
                    return (
                      <div
                        key={slot.getTime()}
                        className="absolute left-0 right-0 border-t border-border/50"
                        style={{ top: `${top}px` }}
                      >
                        <div
                          className="absolute left-0 w-[120px] px-2 py-1 text-xs text-muted-foreground bg-background border-r z-10"
                          style={{ top: "-10px" }}
                        >
                          {format(slot, "HH:mm")}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Coluna do profissional selecionado */}
                <div className="grid absolute inset-0" style={{ gridTemplateColumns: "120px 1fr" }}>
                  {/* Coluna de horários */}
                  <div className="border-r"></div>

                  {/* Coluna do profissional */}
                  <div className="relative">
                    {/* Agendamentos */}
                    {selectedProfessionalAppointments.map((appointment) => {
                      const { top, height } = calculateAppointmentPosition(
                        appointment,
                        dayStart
                      )

                      return (
                        <div
                          key={appointment.id}
                          className="absolute left-2 right-2 rounded-md border-l-4 shadow-sm p-3 bg-card hover:shadow-md transition-shadow cursor-pointer"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            minHeight: "60px",
                            borderLeftColor: getStatusColor(appointment.status).includes("green")
                              ? "rgb(34 197 94)"
                              : getStatusColor(appointment.status).includes("yellow")
                              ? "rgb(234 179 8)"
                              : getStatusColor(appointment.status).includes("red")
                              ? "rgb(239 68 68)"
                              : "rgb(59 130 246)",
                          }}
                          title={`${appointment.clientName || "Cliente"} - ${appointment.serviceName} (${formatBrazilTime(appointment.startTime, "HH:mm")} - ${formatBrazilTime(appointment.endTime, "HH:mm")})`}
                        >
                          <div className="text-sm font-semibold truncate">
                            {appointment.clientName || "Cliente"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-1">
                            {appointment.serviceName}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatBrazilTime(appointment.startTime, "HH:mm")} - {formatBrazilTime(appointment.endTime, "HH:mm")}
                          </div>
                          <Badge
                            variant="outline"
                            className={`mt-2 text-[10px] ${getStatusColor(appointment.status)}`}
                          >
                            {appointment.status === "confirmed"
                              ? "Confirmado"
                              : appointment.status === "pending"
                              ? "Pendente"
                              : appointment.status === "cancelled"
                              ? "Cancelado"
                              : "Concluído"}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

