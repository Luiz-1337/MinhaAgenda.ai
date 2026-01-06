"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Search, Plus, User, Pencil, Clock, Trash2, AlertCircle, X, Save } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { getProfessionals, upsertProfessional, deleteProfessional } from "@/app/actions/professionals"
import type { ProfessionalRow } from "@/lib/types/professional"
import { useSalon, useSalonAuth } from "@/contexts/salon-context"
import { canAddProfessional } from "@/lib/utils/permissions"
import AvailabilitySheet from "@/components/team/availability-sheet"

// Função para formatar os dias da semana
function formatWorkingDays(days?: number[]): string {
  if (!days || days.length === 0) {
    return "—"
  }

  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  return days.map((day) => dayNames[day]).join(", ")
}

const professionalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["MANAGER", "STAFF"]).optional(),
  isActive: z.boolean().default(true),
})
type ProfessionalForm = z.infer<typeof professionalSchema>

export default function TeamPage() {
  const { activeSalon } = useSalon()
  const { planTier, isManager } = useSalonAuth()
  
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [list, setList] = useState<ProfessionalRow[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ProfessionalRow | null>(null)
  const [, startTransition] = useTransition()
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [selectedProfessional, setSelectedProfessional] = useState<ProfessionalRow | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [professionalToDelete, setProfessionalToDelete] = useState<{ id: string; name: string } | null>(null)

  const form = useForm<ProfessionalForm>({
    resolver: zodResolver(professionalSchema) as any,
    defaultValues: { name: "", email: "", phone: "", role: "STAFF", isActive: true },
  })

  // Calcula contagem de ativos
  const activeCount = useMemo(() => list.filter(p => p.is_active).length, [list])
  const canCreate = canAddProfessional(planTier, activeCount)

  useEffect(() => {
    if (!activeSalon) return

    setIsLoading(true)
    startTransition(async () => {
      const res = await getProfessionals(activeSalon.id)
      if (Array.isArray(res)) {
        setList(res)
      } else {
        toast.error(res.error)
      }
      setIsLoading(false)
    })
  }, [activeSalon?.id])

  const filteredTeam = useMemo(() => {
    return list.filter((member) => {
      const matchesFilter =
        filter === "all" ? true : filter === "active" ? member.is_active : !member.is_active

      const matchesSearch =
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.email.toLowerCase().includes(searchTerm.toLowerCase())

      return matchesFilter && matchesSearch
    })
  }, [list, filter, searchTerm])

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", email: "", phone: "", role: "STAFF", isActive: true })
    setOpen(true)
  }

  function openEdit(p: ProfessionalRow) {
    setEditing(p)
    form.reset({ 
      id: p.id, 
      name: p.name, 
      email: p.email, 
      phone: p.phone || "", 
      role: p.role || "STAFF",
      isActive: p.is_active 
    })
    setOpen(true)
  }

  async function onSubmit(values: ProfessionalForm) {
    if (!activeSalon) {
      toast.error("Selecione um salão")
      return
    }

    startTransition(async () => {
      const res = await upsertProfessional({ ...values, salonId: activeSalon.id })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success(editing ? "Profissional atualizado" : "Profissional criado")
      setOpen(false)
      setEditing(null)
      const again = await getProfessionals(activeSalon.id)
      if (Array.isArray(again)) setList(again)
    })
  }

  function handleDeleteClick(professional: ProfessionalRow) {
    setProfessionalToDelete({ id: professional.id, name: professional.name })
    setDeleteConfirmOpen(true)
  }

  async function onDelete() {
    if (!activeSalon || !professionalToDelete) {
      toast.error("Selecione um salão")
      return
    }

    setDeleteConfirmOpen(false)
    startTransition(async () => {
      const res = await deleteProfessional(professionalToDelete.id, activeSalon.id)
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Profissional removido")
      setProfessionalToDelete(null)
      const again = await getProfessionals(activeSalon.id)
      if (Array.isArray(again)) setList(again)
    })
  }

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header */}
      <div className="flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <User size={24} className="text-slate-400" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Equipe</h2>
        </div>
        
        {canCreate ? (
          <>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Plus size={16} />
              Convidar membro
            </button>
            
            {/* Professional Modal */}
            {open && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <div 
                  className="absolute inset-0 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300" 
                  onClick={() => setOpen(false)} 
                />
                
                {/* Modal Card */}
                <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh]">
                  
                  {/* Header */}
                  <div className="p-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500 rounded-lg text-white shadow-lg shadow-emerald-500/20">
                        <User size={18} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">
                          {editing ? "Editar Profissional" : "Novo Profissional"}
                        </h2>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Configuração de membro</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setOpen(false)}
                      disabled={form.formState.isSubmitting}
                      className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Body */}
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
                    <div className="p-5 space-y-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          Nome Completo <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          placeholder="Ex: Ana Souza" 
                          {...form.register("name")}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" 
                        />
                        {form.formState.errors.name && (
                          <p className="text-xs text-red-500 mt-1">{form.formState.errors.name.message}</p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                          E-mail <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="email" 
                          placeholder="ana@empresa.com" 
                          {...form.register("email")}
                          className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" 
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Se este e-mail já estiver cadastrado no sistema, o usuário será vinculado automaticamente.
                        </p>
                        {form.formState.errors.email && (
                          <p className="text-xs text-red-500 mt-1">{form.formState.errors.email.message}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Telefone</label>
                          <input 
                            type="text" 
                            placeholder="(11) 9XXXX-XXXX" 
                            {...form.register("phone")}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" 
                          />
                        </div>
                        
                        {/* Seletor de Role apenas para Manager */}
                        {isManager && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Permissão</label>
                            <Controller
                              name="role"
                              control={form.control}
                              render={({ field }) => (
                                <Select onValueChange={field.onChange} value={field.value || "STAFF"}>
                                  <SelectTrigger className="bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-white/10">
                                    <SelectValue placeholder="Selecione..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="STAFF">Staff (Padrão)</SelectItem>
                                    <SelectItem value="MANAGER">Gerente</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <Controller
                          name="isActive"
                          control={form.control}
                          render={({ field }) => (
                            <Label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 cursor-pointer">
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                              <span>Profissional Ativo</span>
                            </Label>
                          )}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-slate-100 dark:border-white/5 flex justify-end gap-3 bg-slate-50/30 dark:bg-white/[0.01]">
                      <button 
                        type="button"
                        onClick={() => setOpen(false)}
                        disabled={form.formState.isSubmitting}
                        className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="submit"
                        disabled={form.formState.isSubmitting}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 flex items-center gap-2 transform active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                      >
                        <Save size={18} />
                        {form.formState.isSubmitting ? "Salvando..." : editing ? "Salvar Profissional" : "Criar Profissional"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 rounded-lg text-sm font-medium border border-amber-200 dark:border-amber-500/20">
            <AlertCircle size={16} />
            <span>Limite do plano {planTier} atingido</span>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white/50 dark:bg-slate-900/40 backdrop-blur-md p-2 rounded-xl border border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "active"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Ativos
          </button>
          <button
            onClick={() => setFilter("inactive")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "inactive"
                ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Inativos
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-hidden bg-white/60 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-2 pl-2">Nome</div>
          <div className="col-span-1">Role</div>
          <div className="col-span-3">E-mail</div>
          <div className="col-span-2">Telefone</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-3 text-right pr-2">Ações</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : filteredTeam.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <User size={32} className="mb-3 opacity-50" />
              <p>Nenhum membro encontrado.</p>
            </div>
          ) : (
            filteredTeam.map((member, index) => (
              <div
                key={member.id}
                className={`grid grid-cols-12 gap-4 p-4 items-center border-b border-slate-100 dark:border-white/5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${
                  index % 2 === 0 ? "bg-transparent" : "bg-slate-50/30 dark:bg-white/[0.01]"
                }`}
              >
                <div className="col-span-2 pl-2 font-semibold text-slate-700 dark:text-slate-200 truncate flex items-center gap-2">
                  {member.name}
                </div>

                <div className="col-span-1 text-xs">
                    {member.role === 'MANAGER' && <span className="text-indigo-600 dark:text-indigo-400 font-medium">Manager</span>}
                    {(!member.role || member.role === 'STAFF') && <span className="text-slate-500">Staff</span>}
                </div>

                <div className="col-span-3 text-slate-600 dark:text-slate-400 truncate text-xs">
                  {member.email}
                  {member.user_id && <span className="ml-1 text-[10px] text-emerald-500 font-mono">(Vinculado)</span>}
                </div>

                <div className="col-span-2 text-slate-600 dark:text-slate-400 font-mono text-xs truncate">
                  {member.phone || "—"}
                </div>

                <div className="col-span-1">
                  {member.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-500">
                      Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-xs font-bold text-slate-400">
                      Inativo
                    </span>
                  )}
                </div>

                <div className="col-span-3 flex justify-end gap-2 pr-2">
                  <button
                    onClick={() => openEdit(member)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Pencil size={12} />
                    Editar
                  </button>
                  <button
                    onClick={() => {
                      setSelectedProfessional(member)
                      setAvailabilityOpen(true)
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Clock size={12} />
                    Horários
                  </button>
                  <button
                    onClick={() => handleDeleteClick(member)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 text-xs font-medium text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Trash2 size={12} />
                    
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedProfessional && (
        <AvailabilitySheet
          open={availabilityOpen}
          onOpenChange={(v) => {
            setAvailabilityOpen(v)
            if (!v) setSelectedProfessional(null)
          }}
          professional={{ id: selectedProfessional.id, name: selectedProfessional.name }}
        />
      )}

      {/* Dialog de Confirmação de Exclusão */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700 dark:text-slate-300">
              Tem certeza que deseja remover o profissional <strong>"{professionalToDelete?.name}"</strong>?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Esta ação não pode ser desfeita. O profissional será removido permanentemente, incluindo seus horários e associações com serviços.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setProfessionalToDelete(null)
              }}
              className="border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
