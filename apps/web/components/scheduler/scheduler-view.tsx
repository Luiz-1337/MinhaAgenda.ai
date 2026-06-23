"use client"

import { useState, useEffect, useMemo } from "react"
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { Calendar, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ChevronDown, Users, Plus } from "lucide-react"
import { DailyScheduler } from "./daily-scheduler"
import { WeeklyScheduler } from "./weekly-scheduler"
import { MonthlyScheduler } from "./monthly-scheduler"

const CreateAppointmentDialog = dynamic(
  () => import("./create-appointment-dialog").then(m => ({ default: m.CreateAppointmentDialog })),
  { ssr: false }
)
import { getAppointments, getSchedulerHours } from "@/app/actions/appointments"
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfWeek, endOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"
import {
  startOfDayBrazil,
  endOfDayBrazil,
  startOfWeekBrazil,
  endOfWeekBrazil,
  startOfMonthBrazil,
  endOfMonthBrazil
} from "@/lib/utils/timezone.utils"
import { useSalonAuth } from "@/contexts/salon-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SchedulerViewProps {
  salonId: string
  initialDate?: Date | string
}

type ViewType = "daily" | "weekly" | "monthly"

interface Professional {
  id: string
  name: string
  avatar?: string | null
}

export function SchedulerView({ salonId, initialDate }: SchedulerViewProps) {
  const { isSolo } = useSalonAuth()
  const [viewType, setViewType] = useState<ViewType>("weekly")
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (initialDate) {
      return typeof initialDate === 'string' ? new Date(initialDate) : initialDate
    }
    return new Date()
  })

  // Estado de UI
  const [selectedProId, setSelectedProId] = useState<string | null>(null)
  const [isProDropdownOpen, setIsProDropdownOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  // Range [start, end] derivado da view + data corrente (TZ Brasília)
  const { start, end } = useMemo<{ start: Date; end: Date }>(() => {
    switch (viewType) {
      case 'daily':
        return { start: startOfDayBrazil(currentDate), end: endOfDayBrazil(currentDate) }
      case 'weekly':
        return { start: startOfWeekBrazil(currentDate, { weekStartsOn: 0 }), end: endOfWeekBrazil(currentDate, { weekStartsOn: 0 }) }
      case 'monthly':
        return { start: startOfMonthBrazil(currentDate), end: endOfMonthBrazil(currentDate) }
    }
  }, [viewType, currentDate])

  // Agendamentos + profissionais — cache por tenant/range; keepPreviousData evita o flash ao navegar
  const appointmentsQuery = useQuery({
    queryKey: ['scheduler-appointments', salonId, viewType, start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const result = await getAppointments(salonId, start, end)
      if ('error' in result) throw new Error(result.error)
      return result
    },
    enabled: !!salonId,
    placeholderData: keepPreviousData,
  })

  const appointments = appointmentsQuery.data?.appointments ?? []
  const professionals = appointmentsQuery.data?.professionals ?? []
  const loading = appointmentsQuery.isLoading
  const error = appointmentsQuery.error ? (appointmentsQuery.error as Error).message : null

  // Horários do calendário (disponibilidade do salão/profissional)
  const hoursQuery = useQuery({
    queryKey: ['scheduler-hours', salonId, selectedProId],
    queryFn: async () => {
      const res = await getSchedulerHours(salonId, selectedProId)
      if ('error' in res) throw new Error(res.error)
      return res
    },
    enabled: !!salonId,
  })
  const schedulerHours = hoursQuery.data ?? { startHour: 8, endHour: 22 }

  // Seleciona o primeiro profissional automaticamente se nenhum estiver selecionado
  useEffect(() => {
    if (professionals.length > 0 && !selectedProId) {
       // Filtra apenas ativos para seleção automática, embora a query já deva retornar ativos ou a UI filtre
       const activePros = professionals.filter(p => p.isActive)
       if (activePros.length > 0) {
         setSelectedProId(activePros[0].id) // Seleciona o primeiro específico por padrão? Ou 'all'?
         // O código original selecionava o primeiro.
         // Mas o dropdown original tinha opção "Todos". Vamos manter consistência com o original.
         // Se o design original tinha "Todos", vamos ver.
         // Código original:
         // setProfessionals([{ id: 'all', name: 'Todos os Profissionais' }, ...active])
         // setSelectedPro(allProfessionals[0]) // que era 'all'

         // Se eu quiser suportar "Todos", precisaria ajustar a lógica de filtragem nos subcomponentes ou filtrar aqui.
         // Os subcomponentes originais recebiam `selectedProfessionalId` e filtravam por ele.
         // Se eu passar 'all', eles precisam saber lidar.
         // Mas olhando o código dos subcomponentes que acabei de escrever:
         // `appointmentsByProfessional.get(selectedProfessionalId)` -> Isso implica que eles esperam um ID específico.
         // Para suportar "Todos", eu teria que alterar os subcomponentes ou lidar com isso aqui.
         // O código original dos subcomponentes (Daily/Weekly) também tinha lógica:
         // const selectedProfessionalAppointments = ... appointmentsByProfessional.get(selectedProfessionalId)
         // Parece que eles NÃO suportavam ver todos ao mesmo tempo na visualização detalhada (Daily/Weekly),
         // pois filtravam por ID único.
         // Vamos manter o comportamento de selecionar um específico por enquanto para garantir que funcione como antes na visualização,
         // ou implementar a visualização de "Todos" se for desejado.
         // O código original do SchedulerView tinha a opção 'all' no dropdown, mas não vi como isso era passado para os subcomponentes.
         // Ah, o SchedulerView original NÃO passava selectedPro para os subcomponentes!
         // Os subcomponentes tinham seu PRÓPRIO estado `selectedProfessionalId` e lógica de seleção interna!
         // Então a seleção no `SchedulerView` (cabeçalho) era desconectada da seleção dentro do `DailyScheduler`?
         // Espera, olhando o código original do `SchedulerView`:
         // Ele tinha um dropdown de profissionais no Header.
         // Mas ele passava APENAS `salonId` e `initialDate` para `DailyScheduler`.
         // E `DailyScheduler` tinha seu PRÓPRIO fetch e seu PRÓPRIO estado `selectedProfessionalId`.
         // Isso significa que o dropdown no Header do `SchedulerView` NÃO controlava os subcomponentes?
         // Isso parece um bug ou inconsistência da versão anterior, ou eu perdi algo.
         // O dropdown no SchedulerView original parecia ser apenas visual ou incompleto.

         // NA MINHA REFATORAÇÃO:
         // Eu tornei o `SchedulerView` o "dono" da verdade.
         // Eu vou passar `selectedProfessionalId` para os subcomponentes.
         // Assim o dropdown do Header vai controlar a view.
         setSelectedProId(activePros[0].id)
       }
    }
  }, [professionals, selectedProId])

  // Helpers para UI
  const selectedPro = useMemo(() => {
    if (!selectedProId) return null
    return professionals.find(p => p.id === selectedProId) || null
  }, [professionals, selectedProId])

  // Formatação para Dropdown
  const dropdownProfessionals = useMemo(() => {
    return professionals.filter(p => p.isActive).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.name.split(' ').map(n => n[0]).slice(0, 2).join('')
    }))
  }, [professionals])

  const navigateDate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      switch (viewType) {
        case 'daily':
          return direction === 'prev' ? subDays(prev, 1) : addDays(prev, 1)
        case 'weekly':
          return direction === 'prev' ? subWeeks(prev, 1) : addWeeks(prev, 1)
        case 'monthly':
          return direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
        default:
          return prev
      }
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Recarrega após criar agendamento: invalida o cache do range (refetch automático)
  const handleAppointmentCreated = () => {
    void queryClient.invalidateQueries({ queryKey: ['scheduler-appointments', salonId] })
  }

  const getDateLabel = () => {
    switch (viewType) {
      case 'daily':
        return format(currentDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
      case 'weekly':
        const weekStart = startOfWeek(currentDate, { locale: ptBR })
        const weekEnd = endOfWeek(currentDate, { locale: ptBR })
        return `${format(weekStart, "d 'de' MMM", { locale: ptBR })} - ${format(weekEnd, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
      case 'monthly':
        return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
      default:
        return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
    }
  }

  const renderHeader = () => (
    <div className="flex flex-col gap-3 mb-4 lg:mb-6">
      {/* Row 1: Date Navigation + New Appointment */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center bg-card border border-border rounded-lg p-1 flex-1 sm:flex-initial">
          <button
            onClick={() => navigateDate('prev')}
            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 sm:flex-initial px-2 sm:px-4 font-semibold text-foreground sm:min-w-[180px] lg:min-w-[200px] text-center text-xs sm:text-sm truncate">
            {getDateLabel()}
          </div>
          <button
            onClick={() => navigateDate('next')}
            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={goToToday}
            className="flex-1 sm:flex-initial px-3 py-2 bg-accent/10 text-accent rounded-lg text-xs sm:text-sm font-medium border border-accent/20 hover:bg-accent/20 transition-colors"
          >
            Hoje
          </button>
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex-1 sm:flex-initial px-3 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-xs sm:text-sm font-medium  flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Novo Agendamento</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
      </div>

      {/* Row 2: Professional Dropdown + View Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        {/* Professional Dropdown */}
        {!loading && selectedPro && dropdownProfessionals.length > 1 && !isSolo && (
          <DropdownMenu open={isProDropdownOpen} onOpenChange={setIsProDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className="w-full sm:w-auto flex items-center gap-2 px-3 sm:px-4 py-2 bg-card border border-border rounded-lg text-xs sm:text-sm text-foreground hover:border-accent/50 transition-colors sm:min-w-[180px] justify-between flex-1 sm:flex-initial"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                    {selectedPro.name.split(' ').map(n => n[0]).slice(0, 2).join('') || <Users size={12} />}
                  </div>
                  <span className="truncate">{selectedPro.name}</span>
                </div>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform flex-shrink-0 ${isProDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="min-w-[200px] bg-card border-border rounded-xl p-1">
              {dropdownProfessionals.map(pro => (
                <DropdownMenuItem
                  key={pro.id}
                  onClick={() => { setSelectedProId(pro.id); setIsProDropdownOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer rounded-lg"
                >
                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground flex-shrink-0">
                    {pro.avatar || <Users size={12} />}
                  </div>
                  {pro.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* View Switcher */}
        <div className="flex bg-muted rounded-md p-1 border border-border self-stretch sm:self-auto">
          {[
            { id: 'daily' as ViewType, label: 'Diário', shortLabel: 'Dia', icon: Calendar },
            { id: 'weekly' as ViewType, label: 'Semanal', shortLabel: 'Sem', icon: CalendarRange },
            { id: 'monthly' as ViewType, label: 'Mensal', shortLabel: 'Mês', icon: CalendarDays }
          ].map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.id}
                onClick={() => setViewType(v.id)}
                className={`flex-1 sm:flex-initial px-2 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1 sm:gap-1.5 ${
                  viewType === v.id
                  ? 'bg-card text-accent'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{v.label}</span>
                <span className="sm:hidden">{v.shortLabel}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      {renderHeader()}
      <div className="flex-1 min-h-0">
        {viewType === "daily" && (
          <DailyScheduler
            salonId={salonId}
            currentDate={currentDate}
            appointments={appointments}
            professionals={professionals}
            loading={loading}
            error={error}
            selectedProfessionalId={selectedProId}
            startHour={schedulerHours.startHour}
            endHour={schedulerHours.endHour}
          />
        )}
        {viewType === "weekly" && (
          <WeeklyScheduler
            salonId={salonId}
            currentDate={currentDate}
            appointments={appointments}
            professionals={professionals}
            loading={loading}
            error={error}
            selectedProfessionalId={selectedProId}
            startHour={schedulerHours.startHour}
            endHour={schedulerHours.endHour}
          />
        )}
        {viewType === "monthly" && (
          <MonthlyScheduler
            salonId={salonId}
            currentDate={currentDate}
            appointments={appointments}
            professionals={professionals}
            loading={loading}
            error={error}
            selectedProfessionalId={selectedProId}
            onDayClick={(date) => {
              setCurrentDate(date)
              setViewType("daily")
            }}
          />
        )}
      </div>

      {/* Create Appointment Dialog */}
      <CreateAppointmentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        salonId={salonId}
        professionals={professionals}
        onSuccess={handleAppointmentCreated}
      />
    </div>
  )
}
