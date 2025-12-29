"use client"

import { useState, useEffect, useMemo } from "react"
import { Calendar, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ChevronDown, Users } from "lucide-react"
import { DailyScheduler } from "./DailyScheduler"
import { WeeklyScheduler } from "./WeeklyScheduler"
import { MonthlyScheduler } from "./MonthlyScheduler"
import { getAppointments, type AppointmentDTO, type ProfessionalInfo } from "@/app/actions/appointments"
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
  
  // Estado unificado de dados
  const [appointments, setAppointments] = useState<AppointmentDTO[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Estado de UI
  const [selectedProId, setSelectedProId] = useState<string | null>(null)
  const [isProDropdownOpen, setIsProDropdownOpen] = useState(false)

  // Carrega dados unificados (Agendamentos + Profissionais)
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      setError(null)
      
      let start: Date
      let end: Date

      // Calcula range baseado na view
      switch (viewType) {
        case 'daily':
          start = startOfDayBrazil(currentDate)
          end = endOfDayBrazil(currentDate)
          break
        case 'weekly':
          start = startOfWeekBrazil(currentDate, { weekStartsOn: 0 })
          end = endOfWeekBrazil(currentDate, { weekStartsOn: 0 })
          break
        case 'monthly':
          start = startOfMonthBrazil(currentDate)
          end = endOfMonthBrazil(currentDate)
          break
      }

      try {
        const result = await getAppointments(salonId, start, end)
        
        if ('error' in result) {
          setError(result.error)
          setAppointments([])
          setProfessionals([])
        } else {
          setAppointments(result.appointments)
          setProfessionals(result.professionals)
        }
      } catch (err) {
        console.error('Erro ao buscar dados:', err)
        setError('Falha ao carregar agendamentos')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [salonId, currentDate, viewType])

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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement
      if (isProDropdownOpen && !target.closest('.professional-dropdown')) {
        setIsProDropdownOpen(false)
      }
    }
    if (isProDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isProDropdownOpen])

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
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
      
      {/* Date Navigation */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-1">
          <button 
            onClick={() => navigateDate('prev')}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="px-4 font-semibold text-slate-700 dark:text-slate-200 min-w-[200px] text-center text-sm">
            {getDateLabel()}
          </div>
          <button 
            onClick={() => navigateDate('next')}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md text-slate-500 dark:text-slate-400 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button 
          onClick={goToToday}
          className="px-3 py-2 bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-lg text-sm font-medium border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
        >
          Hoje
        </button>
      </div>

      {/* Controls: Professional & View Type */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        
        {/* Professional Dropdown */}
        {!loading && selectedPro && dropdownProfessionals.length > 1 && !isSolo && (
          <div className="relative professional-dropdown">
            <button 
              onClick={() => setIsProDropdownOpen(!isProDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 transition-colors min-w-[200px] justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  {selectedPro.name.split(' ').map(n => n[0]).slice(0, 2).join('') || <Users size={12} />}
                </div>
                <span className="truncate">{selectedPro.name}</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isProDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isProDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {dropdownProfessionals.map(pro => (
                  <button
                    key={pro.id}
                    onClick={() => { setSelectedProId(pro.id); setIsProDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-white/5 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      {pro.avatar || <Users size={12} />}
                    </div>
                    {pro.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {isSolo && selectedPro && (
          <div className="px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-700 dark:text-indigo-300">
            No plano SOLO, os agendamentos são automaticamente vinculados a você.
          </div>
        )}

        {/* View Switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 border border-slate-200 dark:border-white/5">
          {[
            { id: 'daily' as ViewType, label: 'Diário', icon: Calendar },
            { id: 'weekly' as ViewType, label: 'Semanal', icon: CalendarRange },
            { id: 'monthly' as ViewType, label: 'Mensal', icon: CalendarDays }
          ].map((v) => {
            const Icon = v.icon
            return (
              <button
                key={v.id}
                onClick={() => setViewType(v.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  viewType === v.id 
                  ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm dark:shadow-lg dark:shadow-indigo-500/20' 
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon size={14} />
                {v.label}
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
          />
        )}
      </div>
    </div>
  )
}
