"use client"

import { useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { X, Calendar, User, Briefcase, Zap, FileText, Clock } from "lucide-react"
import { createAppointment } from "@/app/actions/appointments"
import { getSalonCustomers, type CustomerRow } from "@/app/actions/customers"
import { getServices } from "@/app/actions/services"
import type { ServiceRow } from "@/lib/types/service"
import type { ProfessionalInfo } from "@/app/actions/appointments"

interface CreateAppointmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  salonId: string
  professionals: ProfessionalInfo[]
  onSuccess?: () => void
}

export function CreateAppointmentDialog({
  open,
  onOpenChange,
  salonId,
  professionals,
  onSuccess,
}: CreateAppointmentDialogProps) {
  const [clientId, setClientId] = useState("")
  const [professionalId, setProfessionalId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [notes, setNotes] = useState("")
  const [isPending, startTransition] = useTransition()
  
  // Estados para dados carregados
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [services, setServices] = useState<ServiceRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingServices, setLoadingServices] = useState(false)

  // Carrega clientes e serviços quando o modal abre
  useEffect(() => {
    if (open && salonId) {
      setLoadingCustomers(true)
      setLoadingServices(true)
      
      Promise.all([
        getSalonCustomers(salonId),
        getServices(salonId)
      ]).then(([customersResult, servicesResult]) => {
        if ("error" in customersResult) {
          toast.error(customersResult.error)
          setCustomers([])
        } else {
          setCustomers(customersResult.data || [])
        }
        setLoadingCustomers(false)

        if ("error" in servicesResult) {
          toast.error(servicesResult.error)
          setServices([])
        } else {
          setServices(servicesResult.data || [])
        }
        setLoadingServices(false)
      })
    }
  }, [open, salonId])

  // Seleciona o primeiro profissional automaticamente se houver apenas um
  useEffect(() => {
    if (professionals.length === 1 && !professionalId) {
      setProfessionalId(professionals[0].id)
    }
  }, [professionals, professionalId])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Validação
    if (!clientId) {
      toast.error("Selecione um cliente")
      return
    }

    if (!professionalId) {
      toast.error("Selecione um profissional")
      return
    }

    if (!serviceId) {
      toast.error("Selecione um serviço")
      return
    }

    if (!date || !time) {
      toast.error("Data e hora são obrigatórias")
      return
    }

    // Combina data e hora em formato ISO (sem timezone)
    // O serviço trata como UTC-3 automaticamente
    const dateTimeString = `${date}T${time}:00`
    
    // Valida se a data é no futuro
    // Cria uma data local para validação (assumindo que o usuário está no Brasil)
    const [year, month, day] = date.split('-').map(Number)
    const [hour, minute] = time.split(':').map(Number)
    const appointmentDate = new Date(year, month - 1, day, hour, minute)
    const now = new Date()
    
    if (appointmentDate <= now) {
      toast.error("A data e hora devem ser no futuro")
      return
    }

    // Envia no formato ISO sem timezone (o serviço trata como UTC-3)
    const isoDate = dateTimeString

    startTransition(async () => {
      const result = await createAppointment({
        salonId,
        professionalId,
        clientId,
        serviceId,
        date: isoDate,
        notes: notes.trim() || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Agendamento criado com sucesso!")
        // Limpa o formulário
        setClientId("")
        setProfessionalId("")
        setServiceId("")
        setDate("")
        setTime("")
        setNotes("")
        // Fecha o dialog
        onOpenChange(false)
        // Chama callback de sucesso para atualizar a lista
        if (onSuccess) {
          onSuccess()
        }
      }
    })
  }

  const handleClose = () => {
    if (!isPending) {
      onOpenChange(false)
      // Limpa o formulário ao fechar
      setClientId("")
      setProfessionalId("")
      setServiceId("")
      setDate("")
      setTime("")
      setNotes("")
    }
  }

  // Filtra serviços ativos
  const activeServices = services.filter(s => s.is_active)
  
  // Filtra profissionais ativos
  const activeProfessionals = professionals.filter(p => p.isActive)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300" 
        onClick={handleClose} 
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Novo Agendamento</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Criar agendamento manual</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            disabled={isPending}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Cliente <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <User size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={isPending || loadingCustomers}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} {customer.phone ? `- ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Profissional */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Profissional <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <Briefcase size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <select
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                  disabled={isPending || activeProfessionals.length === 0}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  <option value="">Selecione um profissional</option>
                  {activeProfessionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>
                      {professional.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Serviço */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Serviço <span className="text-red-500">*</span>
              </label>
              <div className="relative group">
                <Zap size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={isPending || loadingServices}
                  required
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  <option value="">Selecione um serviço</option>
                  {activeServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.duration} min) - R$ {parseFloat(service.price).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Data e Hora */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Data <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <Calendar size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={isPending}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  Hora <span className="text-red-500">*</span>
                </label>
                <div className="relative group">
                  <Clock size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <input 
                    type="time" 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={isPending}
                    required
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Observações</label>
              <div className="relative group">
                <FileText size={16} className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <textarea 
                  rows={3} 
                  placeholder="Observações sobre o agendamento (opcional)" 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isPending}
                  maxLength={1000}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50/30 dark:bg-white/[0.01]">
            <button 
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <Calendar size={18} />
              {isPending ? "Criando..." : "Criar Agendamento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
