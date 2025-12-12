"use client"

import { useState, useEffect } from "react"
import { Calendar, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ChevronDown, Users } from "lucide-react"
import { DailyScheduler } from "./DailyScheduler"
import { WeeklyScheduler } from "./WeeklyScheduler"
import { MonthlyScheduler } from "./MonthlyScheduler"
import { getProfessionals } from "@/app/actions/professionals"
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths, startOfMonth, startOfWeek, endOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale/pt-BR"

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
  const [viewType, setViewType] = useState<ViewType>("weekly")
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (initialDate) {
      return typeof initialDate === 'string' ? new Date(initialDate) : initialDate
    }
    return new Date()
  })
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [selectedPro, setSelectedPro] = useState<Professional | null>(null)
  const [isProDropdownOpen, setIsProDropdownOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfessionals() {
      try {
        const result = await getProfessionals(salonId)
        if (!('error' in result)) {
          const allProfessionals: Professional[] = [
            { id: 'all', name: 'Todos os Profissionais', avatar: null },
            ...result.map(p => ({ id: p.id, name: p.name, avatar: p.name.split(' ').map(n => n[0]).slice(0, 2).join('') }))
          ]
          setProfessionals(allProfessionals)
          setSelectedPro(allProfessionals[0])
        }
      } catch (error) {
        console.error('Erro ao carregar profissionais:', error)
      } finally {
        setLoading(false)
      }
    }
    loadProfessionals()
  }, [salonId])

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
        {!loading && selectedPro && (
          <div className="relative professional-dropdown">
            <button 
              onClick={() => setIsProDropdownOpen(!isProDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-500/50 transition-colors min-w-[200px] justify-between"
            >
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-300">
                  {selectedPro.avatar || <Users size={12} />}
                </div>
                <span className="truncate">{selectedPro.name}</span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${isProDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isProDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {professionals.map(pro => (
                  <button
                    key={pro.id}
                    onClick={() => { setSelectedPro(pro); setIsProDropdownOpen(false); }}
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
        {viewType === "daily" && <DailyScheduler salonId={salonId} initialDate={currentDate} />}
        {viewType === "weekly" && <WeeklyScheduler salonId={salonId} initialDate={currentDate} />}
        {viewType === "monthly" && <MonthlyScheduler salonId={salonId} initialDate={currentDate} />}
      </div>
    </div>
  )
}

