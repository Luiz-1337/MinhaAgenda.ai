"use client"

import { useState, useTransition, useEffect } from "react"
import { toast } from "sonner"
import { X, Calendar, User, Briefcase, Zap, FileText, Clock, Plus, Phone, Mail } from "lucide-react"
import { createAppointment } from "@/app/actions/appointments"
import { getSalonCustomers, createSalonCustomer, type CustomerRow } from "@/app/actions/customers"
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

  // Estados para criar novo cliente inline
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerEmail, setNewCustomerEmail] = useState("")
  const [creatingCustomer, setCreatingCustomer] = useState(false)

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

  const handleCreateCustomer = async () => {
    // Validação
    if (!newCustomerName.trim()) {
      toast.error("Nome do cliente é obrigatório")
      return
    }

    if (!newCustomerPhone.trim()) {
      toast.error("Telefone do cliente é obrigatório")
      return
    }

    if (newCustomerName.trim().length < 2) {
      toast.error("Nome deve ter pelo menos 2 caracteres")
      return
    }

    // Valida formato do telefone (apenas dígitos)
    const phoneDigits = newCustomerPhone.replace(/\D/g, "")
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      toast.error("Telefone inválido. Use formato: (11) 98765-4321")
      return
    }

    setCreatingCustomer(true)

    try {
      const result = await createSalonCustomer({
        salonId,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        email: newCustomerEmail.trim() || undefined,
      })

      if ("error" in result) {
        toast.error(result.error)
      } else if (result.data) {
        const newCustomer = result.data
        toast.success("Cliente criado com sucesso!")
        // Adiciona o novo cliente à lista
        setCustomers((prev) => [...prev, newCustomer])
        // Seleciona o cliente recém-criado
        setClientId(newCustomer.id)
        // Limpa o formulário de criar cliente
        setNewCustomerName("")
        setNewCustomerPhone("")
        setNewCustomerEmail("")
        setShowCreateCustomer(false)
      }
    } catch (error) {
      toast.error("Erro ao criar cliente. Tente novamente.")
    } finally {
      setCreatingCustomer(false)
    }
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
      setShowCreateCustomer(false)
      setNewCustomerName("")
      setNewCustomerPhone("")
      setNewCustomerEmail("")
    }
  }

  // Filtra serviços ativos
  const activeServices = services.filter(s => s.is_active)
  
  // Filtra profissionais ativos
  const activeProfessionals = professionals.filter(p => p.isActive)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 z-30 animate-in fade-in duration-300"
        onClick={handleClose} 
      />
      
      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-card border border-border rounded-lg z-40 flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex justify-between items-center bg-muted/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent rounded-lg text-accent-foreground">
              <Calendar size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground tracking-tight">Novo Agendamento</h2>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Criar agendamento manual</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            disabled={isPending}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5">
            {/* Cliente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Cliente <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="relative group">
                <User size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={isPending || loadingCustomers || showCreateCustomer}
                  required={!showCreateCustomer}
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} {customer.phone ? `- ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botão para criar novo cliente */}
              {!showCreateCustomer && (
                <button
                  type="button"
                  onClick={() => setShowCreateCustomer(true)}
                  disabled={isPending || loadingCustomers}
                  className="mt-2 text-xs font-bold text-accent hover:text-accent/80 flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                  Novo Cliente
                </button>
              )}

              {/* Formulário inline para criar cliente */}
              {showCreateCustomer && (
                <div className="mt-3 p-4 bg-accent/10 border border-accent/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Criar Novo Cliente
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateCustomer(false)
                        setNewCustomerName("")
                        setNewCustomerPhone("")
                        setNewCustomerEmail("")
                      }}
                      disabled={creatingCustomer}
                      className="text-accent hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Nome */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-accent">
                      Nome <span className="text-red-600 dark:text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <User size={14} className="absolute left-2.5 top-2.5 text-accent" />
                      <input
                        type="text"
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        placeholder="Nome completo do cliente"
                        disabled={creatingCustomer}
                        className="w-full bg-card border border-accent/30 rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Telefone */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-accent">
                      Telefone <span className="text-red-600 dark:text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-2.5 top-2.5 text-accent" />
                      <input
                        type="tel"
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        placeholder="(11) 98765-4321"
                        disabled={creatingCustomer}
                        className="w-full bg-card border border-accent/30 rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-accent">
                      Email (opcional)
                    </label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-2.5 top-2.5 text-accent" />
                      <input
                        type="email"
                        value={newCustomerEmail}
                        onChange={(e) => setNewCustomerEmail(e.target.value)}
                        placeholder="cliente@email.com"
                        disabled={creatingCustomer}
                        className="w-full bg-card border border-accent/30 rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Botões */}
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCreateCustomer}
                      disabled={creatingCustomer || !newCustomerName.trim() || !newCustomerPhone.trim()}
                      className="flex-1 px-3 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-lg text-xs font-bold shadow-lg shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {creatingCustomer ? "Criando..." : "Criar e Selecionar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateCustomer(false)
                        setNewCustomerName("")
                        setNewCustomerPhone("")
                        setNewCustomerEmail("")
                      }}
                      disabled={creatingCustomer}
                      className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profissional */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Profissional <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="relative group">
                <Briefcase size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <select
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                  disabled={isPending || activeProfessionals.length === 0}
                  required
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
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
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Serviço <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="relative group">
                <Zap size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  disabled={isPending || loadingServices}
                  required
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer"
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
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Data <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <div className="relative group">
                  <Calendar size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={isPending}
                    required
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Hora <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <div className="relative group">
                  <Clock size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                  <input 
                    type="time" 
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={isPending}
                    required
                    className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all disabled:opacity-50 disabled:cursor-not-allowed" 
                  />
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observações</label>
              <div className="relative group">
                <FileText size={16} className="absolute left-3 top-3.5 text-muted-foreground group-focus-within:text-accent transition-colors" />
                <textarea 
                  rows={3} 
                  placeholder="Observações sobre o agendamento (opcional)" 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isPending}
                  maxLength={1000}
                  className="w-full bg-background border border-border rounded-md pl-10 pr-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed" 
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/30">
            <button 
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md text-sm font-bold shadow-lg shadow-accent/20 flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
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
